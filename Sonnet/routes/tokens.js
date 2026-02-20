// routes/tokens.js
// Token analytics endpoint (TOKEN-05)

const express = require('express');
const router = express.Router();
const { getTokenMetrics } = require('../services/tokenAnalyticsService');

/**
 * GET /api/tokens/metrics
 * Returns token generation and validation analytics.
 *
 * Query params:
 *   - groupId (optional): filter metrics to a specific group
 *   - days (optional, default 7): lookback window in days
 *
 * Requires: Auth0 token (mounted in server.js with verifyAuth0Token)
 */
router.get('/metrics', async (req, res) => {
  try {
    const groupId = req.query.groupId || null;
    const days = parseInt(req.query.days, 10) || 7;

    const metrics = await getTokenMetrics(groupId, days);
    res.json(metrics);
  } catch (err) {
    console.error('Token metrics error:', err);
    res.status(500).json({ error: 'Failed to retrieve token metrics' });
  }
});

module.exports = router;
