// services/tokenAnalyticsService.js
const { TokenAnalytics, MagicToken, AvailabilityPrompt, sequelize } = require('../models');
const { Op } = require('sequelize');

/**
 * Track a token validation attempt
 * Fire-and-forget - errors are logged but don't fail the request
 *
 * @param {object} options
 * @param {string} options.tokenId - JWT jti claim (may be null if malformed)
 * @param {boolean} options.success - Whether validation succeeded
 * @param {string} options.reason - Failure reason (if failed)
 * @param {string} options.ipAddress - Request IP
 * @param {string} options.userAgent - Browser user agent
 * @param {boolean} options.graceUsed - Whether grace period was used
 */
async function trackValidation({ tokenId, success, reason, ipAddress, userAgent, graceUsed = false }) {
  try {
    await TokenAnalytics.create({
      token_id: tokenId,
      validation_success: success,
      failure_reason: success ? null : reason,
      ip_address: ipAddress,
      user_agent: userAgent ? userAgent.substring(0, 500) : null,
      grace_period_used: graceUsed,
      timestamp: new Date()
    });
  } catch (err) {
    // Log but don't fail the request if analytics tracking fails
    console.error('Failed to track token analytics:', err.message);
  }
}

/**
 * Get token metrics for admin dashboard (TOKEN-05)
 *
 * @param {string} groupId - Optional group filter
 * @param {number} days - Number of days to look back (default 7)
 * @returns {object} Structured metrics for dashboard display
 */
async function getTokenMetrics(groupId = null, days = 7) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Get generation metrics from MagicToken table
  const tokenQuery = {
    where: { createdAt: { [Op.gte]: since } }
  };

  if (groupId) {
    tokenQuery.include = [{
      model: AvailabilityPrompt,
      where: { group_id: groupId },
      required: true
    }];
  }

  const tokens = await MagicToken.findAll(tokenQuery);

  // Get validation metrics from TokenAnalytics
  const validations = await TokenAnalytics.findAll({
    where: { timestamp: { [Op.gte]: since } },
    attributes: [
      'validation_success',
      'failure_reason',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count']
    ],
    group: ['validation_success', 'failure_reason']
  });

  // Aggregate by day for charts
  const dailyStats = await TokenAnalytics.findAll({
    where: { timestamp: { [Op.gte]: since } },
    attributes: [
      [sequelize.fn('DATE', sequelize.col('timestamp')), 'date'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'total'],
      [sequelize.fn('SUM', sequelize.literal('CASE WHEN validation_success THEN 1 ELSE 0 END')), 'successes']
    ],
    group: [sequelize.fn('DATE', sequelize.col('timestamp'))],
    order: [[sequelize.fn('DATE', sequelize.col('timestamp')), 'ASC']]
  });

  // Calculate summary metrics
  const totalGenerated = tokens.length;
  const expiredUnused = tokens.filter(t =>
    new Date() > t.expires_at && t.usage_count === 0
  ).length;

  const failureBreakdown = {};
  let totalValidations = 0;
  let successfulValidations = 0;

  validations.forEach(v => {
    const count = parseInt(v.get('count'));
    totalValidations += count;
    if (v.validation_success) {
      successfulValidations += count;
    } else {
      failureBreakdown[v.failure_reason || 'unknown'] = count;
    }
  });

  return {
    period: { days, since: since.toISOString() },
    generation: {
      total: totalGenerated,
      perDay: (totalGenerated / days).toFixed(1),
      expiredUnused,
      expiryRate: totalGenerated > 0
        ? ((expiredUnused / totalGenerated) * 100).toFixed(1) + '%'
        : '0%'
    },
    validation: {
      total: totalValidations,
      successful: successfulValidations,
      failed: totalValidations - successfulValidations,
      successRate: totalValidations > 0
        ? ((successfulValidations / totalValidations) * 100).toFixed(1) + '%'
        : '0%',
      failureBreakdown
    },
    daily: dailyStats.map(d => ({
      date: d.get('date'),
      total: parseInt(d.get('total')),
      successes: parseInt(d.get('successes'))
    }))
  };
}

/**
 * Helper to extract JWT jti claim even from invalid tokens
 * Useful for analytics logging when token fails verification
 *
 * @param {string} token - JWT string
 * @returns {string|null} The jti claim or null if unparseable
 */
function extractTokenId(token) {
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.decode(token, { complete: false });
    return decoded?.jti || null;
  } catch {
    return null;
  }
}

module.exports = { trackValidation, getTokenMetrics, extractTokenId };
