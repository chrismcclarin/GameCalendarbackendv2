// services/schedulerHealthService.js
// Phase 61 / MAIL-01 — health telemetry for all background schedulers.
//
// Why this exists: a previous production incident had the scheduler "running
// fine" but emitting zero output (silent failure). Sentry exception alerts
// alone do not catch this — there is no exception to capture. This service
// adds two layers of detection:
//
//   1. recordRun(jobName, fn) — wraps each scheduler tick. Captures
//      sent/skipped counts the job returns, persists a SchedulerRun row,
//      logs a structured one-liner, and re-routes thrown errors to Sentry
//      while still propagating them so the existing scheduler console.error
//      paths continue to fire.
//
//   2. checkAnomalies({ jobName }) — looks at the last N runs of a job and
//      raises a Sentry warning if all of them have sent_count=0 AND there
//      exists at least one earlier run within 7 days where sent_count>0.
//      This second condition prevents noise from "naturally quiet" jobs
//      (a brand-new install with no events is allowed to emit zero
//      reminders forever; an established installation that suddenly stops
//      sending is not).
//
// Telemetry MUST NEVER crash a scheduler. All Sentry calls and DB writes
// are wrapped in try/catch. The original job error IS re-thrown so existing
// scheduler-level catch blocks still fire.
const { Op } = require('sequelize');
const { SchedulerRun } = require('../models');

// Lazy-load Sentry — match server.js pattern. Safe if @sentry/node is missing
// or SENTRY_DSN is unset.
let Sentry = null;
if (process.env.SENTRY_DSN) {
  try {
    Sentry = require('@sentry/node');
  } catch (err) {
    console.warn('[schedulerHealth] Sentry not available:', err.message);
  }
}

/**
 * Wrap a scheduler tick function with telemetry.
 *
 * @param {string} jobName - Stable identifier (e.g. 'reminder', 'deadline').
 * @param {Function} fn - Async function returning { sent, skipped } or undefined.
 * @returns {Promise<{ sent: number, skipped: number }>}
 *
 * On success: persists a SchedulerRun row with the returned counts and logs
 *   `[scheduler:${jobName}] sent=N skipped=N duration=Xms`.
 * On failure: persists a SchedulerRun row with error message + zero counts,
 *   captures the exception to Sentry tagged with scheduler_job=${jobName},
 *   logs `[scheduler:${jobName}] FAILED ${err.message}`, then RE-THROWS the
 *   original error so the scheduler's existing catch path still fires.
 *
 * Persistence and Sentry calls are themselves try/catch-guarded — telemetry
 * failures never crash a scheduler.
 */
async function recordRun(jobName, fn) {
  const startedAt = Date.now();
  let result = { sent: 0, skipped: 0 };
  let caught = null;

  try {
    const ret = await fn();
    if (ret && typeof ret === 'object') {
      result = {
        sent: Number.isFinite(ret.sent) ? ret.sent : 0,
        skipped: Number.isFinite(ret.skipped) ? ret.skipped : 0,
      };
    }
  } catch (err) {
    caught = err;
  }

  const durationMs = Date.now() - startedAt;

  // Persist the run record. Failure here must not crash the scheduler.
  try {
    await SchedulerRun.create({
      job_name: jobName,
      sent_count: result.sent,
      skipped_count: result.skipped,
      error: caught ? String(caught.message || caught).slice(0, 4000) : null,
      duration_ms: durationMs,
      ran_at: new Date(),
    });
  } catch (persistErr) {
    console.error(`[scheduler:${jobName}] Failed to persist SchedulerRun row:`, persistErr.message);
  }

  if (caught) {
    console.error(`[scheduler:${jobName}] FAILED ${caught.message}`);
    // Sentry capture is also best-effort
    if (Sentry) {
      try {
        Sentry.withScope((scope) => {
          scope.setTag('scheduler_job', jobName);
          Sentry.captureException(caught);
        });
      } catch (sentryErr) {
        console.error(`[scheduler:${jobName}] Sentry capture failed:`, sentryErr.message);
      }
    }
    // Re-throw so the scheduler's existing catch block still fires.
    throw caught;
  }

  console.log(`[scheduler:${jobName}] sent=${result.sent} skipped=${result.skipped} duration=${durationMs}ms`);
  return result;
}

/**
 * Detect zero-output anomalies for a single job.
 *
 * Alert criteria (BOTH must hold):
 *   1. The most recent `threshold` runs within `lookbackHours` ALL have
 *      sent_count === 0 (and there are >= `threshold` such runs).
 *   2. There exists at least one earlier run within `historyDays` days
 *      where sent_count > 0 (the job is historically non-zero).
 *
 * Condition 2 prevents noise from naturally-quiet jobs.
 *
 * @param {Object} opts
 * @param {string} opts.jobName
 * @param {number} [opts.threshold=3] - Consecutive zero runs required to alert.
 * @param {number} [opts.lookbackHours=6] - Window for the recent zero streak.
 * @param {number} [opts.historyDays=7] - Window for "is historically non-zero?"
 * @returns {Promise<{ anomaly: boolean, lastNonZeroAt: Date|null }>}
 */
async function checkAnomalies({ jobName, threshold = 3, lookbackHours = 6, historyDays = 7 } = {}) {
  if (!jobName) throw new Error('checkAnomalies requires jobName');

  const lookbackCutoff = new Date(Date.now() - lookbackHours * 3600 * 1000);
  const historyCutoff = new Date(Date.now() - historyDays * 24 * 3600 * 1000);

  // Recent runs in the lookback window, newest first.
  const recentRuns = await SchedulerRun.findAll({
    where: {
      job_name: jobName,
      ran_at: { [Op.gte]: lookbackCutoff },
    },
    order: [['ran_at', 'DESC']],
    limit: threshold,
  });

  // Need at least `threshold` runs in the window to make an anomaly call.
  if (recentRuns.length < threshold) {
    return { anomaly: false, lastNonZeroAt: null };
  }

  const allZero = recentRuns.every((r) => Number(r.sent_count) === 0);
  if (!allZero) {
    return { anomaly: false, lastNonZeroAt: null };
  }

  // Confirm the job is historically non-zero (avoids noise from quiet jobs).
  const lastNonZero = await SchedulerRun.findOne({
    where: {
      job_name: jobName,
      sent_count: { [Op.gt]: 0 },
      ran_at: { [Op.gte]: historyCutoff },
    },
    order: [['ran_at', 'DESC']],
  });

  if (!lastNonZero) {
    return { anomaly: false, lastNonZeroAt: null };
  }

  // Anomaly confirmed — alert via Sentry.
  console.warn(`[scheduler:${jobName}] Anomaly: ${threshold} consecutive zero-output runs (last non-zero at ${lastNonZero.ran_at.toISOString()})`);
  if (Sentry) {
    try {
      Sentry.withScope((scope) => {
        scope.setLevel('warning');
        scope.setTag('scheduler_job', jobName);
        scope.setTag('scheduler_anomaly', 'zero_output');
        scope.setExtra('threshold', threshold);
        scope.setExtra('lookback_hours', lookbackHours);
        scope.setExtra('last_non_zero_at', lastNonZero.ran_at.toISOString());
        Sentry.captureException(
          new Error(`Scheduler anomaly: ${jobName} produced 0 output for ${threshold} consecutive runs`)
        );
      });
    } catch (sentryErr) {
      console.error(`[schedulerHealth] Sentry capture failed for anomaly on ${jobName}:`, sentryErr.message);
    }
  }

  return { anomaly: true, lastNonZeroAt: lastNonZero.ran_at };
}

// Job names that get swept by runAnomalySweep(). 'backup' is intentionally
// excluded — it runs weekly, so the every-30min sweep with default thresholds
// would always say "no recent runs" and be noisy if we ever lower the threshold.
const SWEEP_JOBS = ['reminder', 'deadline', 'auto_promotion', 'prompt_sync'];

/**
 * Run anomaly checks for every known job. Logs a single summary line.
 * Called by the every-30-minute cron in server.js.
 *
 * Per-job failures are caught so one broken job cannot stop the sweep.
 */
async function runAnomalySweep() {
  const results = {};
  for (const jobName of SWEEP_JOBS) {
    try {
      results[jobName] = await checkAnomalies({ jobName });
    } catch (err) {
      console.error(`[schedulerHealth] Anomaly check failed for ${jobName}:`, err.message);
      results[jobName] = { anomaly: false, error: err.message };
    }
  }
  const anomalies = Object.entries(results).filter(([, r]) => r.anomaly).map(([k]) => k);
  console.log(`[schedulerHealth] Anomaly sweep complete. anomalies=[${anomalies.join(',') || 'none'}]`);
  return results;
}

module.exports = {
  recordRun,
  checkAnomalies,
  runAnomalySweep,
  SWEEP_JOBS,
};
