// workers/deadlineWorker.js
// Processes deadline enforcement jobs with Sentry cron monitoring
const { Worker } = require('bullmq');
const Redis = require('ioredis');
const { processExpiredPrompt } = require('../schedulers/deadlineScheduler');

// Optional Sentry integration
let Sentry = null;
if (process.env.SENTRY_DSN) {
  try {
    Sentry = require('@sentry/node');
  } catch (err) {
    console.warn('[DeadlineWorker] Sentry not available:', err.message);
  }
}

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false
});

const deadlineWorker = new Worker('deadlines', async (job) => {
  const { promptId } = job.data;
  console.log(`[DeadlineWorker] Processing deadline for prompt ${promptId}`);

  // Wrap in Sentry monitor if available
  const processJob = async () => {
    const jobStart = Date.now();
    const { AvailabilityPrompt } = require('../models');
    const prompt = await AvailabilityPrompt.findByPk(promptId);

    if (!prompt) {
      console.log(`[DeadlineWorker] Prompt ${promptId} not found, skipping`);
      return { skipped: true, reason: 'prompt_not_found' };
    }

    if (prompt.status !== 'active') {
      console.log(`[DeadlineWorker] Prompt ${promptId} status is ${prompt.status}, skipping`);
      return { skipped: true, reason: 'prompt_not_active', status: prompt.status };
    }

    await processExpiredPrompt(prompt);

    // Track job processing duration
    if (Sentry) {
      Sentry.metrics.distribution('deadline_job.duration_ms', Date.now() - jobStart, {
        unit: 'millisecond'
      });
    }

    return { promptId, status: 'processed' };
  };

  // Use Sentry cron monitoring if available
  if (Sentry && Sentry.withMonitor) {
    return await Sentry.withMonitor(
      'deadline-enforcement',
      processJob,
      {
        schedule: { type: 'interval', value: 5, unit: 'minute' },
        checkinMargin: 2,  // Alert if 2 minutes late
        maxRuntime: 5,     // Alert if takes >5 minutes
        timezone: 'UTC'
      }
    );
  }

  // Fallback without Sentry
  return await processJob();
}, {
  connection,
  concurrency: 5
});

deadlineWorker.on('failed', (job, err) => {
  console.error(`[DeadlineWorker] Job ${job.id} failed:`, err.message);

  // Report to Sentry if available
  if (Sentry) {
    Sentry.captureException(err, {
      tags: { job_type: 'deadline', prompt_id: job.data.promptId }
    });
  }
});

deadlineWorker.on('completed', (job, result) => {
  console.log(`[DeadlineWorker] Job ${job.id} completed:`, result);
});

module.exports = deadlineWorker;
