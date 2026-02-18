// routes/adminMetrics.js
// GET /api/admin/metrics — aggregated monitoring dashboard endpoint
// Protected by Auth0 token (any authenticated user, matching Bull Board policy)
const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { verifyAuth0Token } = require('../middleware/auth0');

const {
  EmailMetrics,
  MagicToken,
  AvailabilityResponse,
  AvailabilityPrompt
} = require('../models');

// Lazy-load BullMQ queues (Redis may not be available in dev)
function getQueues() {
  try {
    return require('../queues');
  } catch (err) {
    return null;
  }
}

/**
 * GET /api/admin/metrics
 * Returns aggregated KPIs for monitoring dashboard
 * Covers: email deliverability, response rates, queue health, token failures
 */
router.get('/admin/metrics', verifyAuth0Token, async (req, res) => {
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // last 30 days

    // Email deliverability metrics from EmailMetrics table
    const [totalDelivered, totalOpens, totalSpam, totalBounce] = await Promise.all([
      EmailMetrics.count({ where: { event_type: 'delivered', occurred_at: { [Op.gte]: since } } }),
      EmailMetrics.count({ where: { event_type: 'open', sg_machine_open: false, occurred_at: { [Op.gte]: since } } }),
      EmailMetrics.count({ where: { event_type: 'spamreport', occurred_at: { [Op.gte]: since } } }),
      EmailMetrics.count({ where: { event_type: 'bounce', occurred_at: { [Op.gte]: since } } })
    ]);

    // Availability response rate: magic tokens sent vs responses submitted
    const [tokensSent, responsesSubmitted] = await Promise.all([
      MagicToken.count({ where: { createdAt: { [Op.gte]: since } } }),
      AvailabilityResponse.count({ where: { submitted_at: { [Op.ne]: null, [Op.gte]: since } } })
    ]);

    // Token validation failures (expired or revoked tokens in last 30 days)
    const tokenFailures = await MagicToken.count({
      where: {
        status: { [Op.in]: ['expired', 'revoked'] },
        updatedAt: { [Op.gte]: since }
      }
    });

    // Active prompts count
    const activePrompts = await AvailabilityPrompt.count({ where: { status: 'active' } });

    // BullMQ queue metrics (lazy-loaded — may not be available without Redis)
    let queueMetrics = { available: false, reason: 'Redis not configured or workers disabled' };
    const queues = getQueues();
    if (queues) {
      try {
        const { MetricsTime } = require('bullmq');
        const { promptQueue, deadlineQueue, reminderQueue } = queues;

        const [promptCompleted, promptFailed, deadlineCompleted, deadlineFailed] = await Promise.all([
          promptQueue.getMetrics('completed', 0, MetricsTime.ONE_WEEK).catch(() => ({ count: 0 })),
          promptQueue.getMetrics('failed', 0, MetricsTime.ONE_WEEK).catch(() => ({ count: 0 })),
          deadlineQueue.getMetrics('completed', 0, MetricsTime.ONE_WEEK).catch(() => ({ count: 0 })),
          deadlineQueue.getMetrics('failed', 0, MetricsTime.ONE_WEEK).catch(() => ({ count: 0 }))
        ]);

        queueMetrics = {
          available: true,
          prompts_completed_7d: promptCompleted.count,
          prompts_failed_7d: promptFailed.count,
          deadlines_completed_7d: deadlineCompleted.count,
          deadlines_failed_7d: deadlineFailed.count
        };
      } catch (queueErr) {
        queueMetrics = { available: false, reason: queueErr.message };
      }
    }

    res.json({
      period: '30d',
      generated_at: new Date().toISOString(),
      email: {
        delivered: totalDelivered,
        human_opens: totalOpens,
        spam_reports: totalSpam,
        bounces: totalBounce,
        open_rate: totalDelivered > 0 ? Math.round((totalOpens / totalDelivered) * 1000) / 1000 : null,
        spam_rate: totalDelivered > 0 ? Math.round((totalSpam / totalDelivered) * 1000) / 1000 : null,
        bounce_rate: totalDelivered > 0 ? Math.round((totalBounce / totalDelivered) * 1000) / 1000 : null,
        thresholds: { open_rate_target: 0.20, submission_rate_target: 0.40, spam_rate_max: 0.02 }
      },
      responses: {
        tokens_sent: tokensSent,
        submissions: responsesSubmitted,
        submission_rate: tokensSent > 0 ? Math.round((responsesSubmitted / tokensSent) * 1000) / 1000 : null,
        active_prompts: activePrompts
      },
      tokens: {
        validation_failures_30d: tokenFailures
      },
      queues: queueMetrics
    });
  } catch (err) {
    console.error('[AdminMetrics] Error fetching metrics:', err.message);
    res.status(500).json({ error: 'Failed to fetch metrics', message: err.message });
  }
});

module.exports = router;
