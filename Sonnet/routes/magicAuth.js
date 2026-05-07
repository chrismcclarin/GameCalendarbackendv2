// routes/magicAuth.js
// Magic link authentication endpoints for availability forms

const express = require('express');
const router = express.Router();
const { validateToken } = require('../services/magicTokenService');
const { magicTokenLimiter } = require('../middleware/rateLimiter');
const { trackValidation, extractTokenId } = require('../services/tokenAnalyticsService');
const { User } = require('../models');

/**
 * POST /api/magic-auth/validate
 * Validates a magic token and returns user info for UI confirmation
 *
 * Body: { token: string, formLoadedAt?: string }
 * Response:
 *   Success: { valid: true, user: { name: string }, prompt_id: string, expiresAt: string }
 *   Failure: { error: string, action: string }
 */
router.post('/validate', magicTokenLimiter, async (req, res) => {
  try {
    const { token, formLoadedAt } = req.body;

    if (!token) {
      return res.status(400).json({
        error: 'Token is required',
        action: 'request_new'
      });
    }

    const result = await validateToken(token, formLoadedAt, { consume: false });

    if (!result.valid) {
      // Track failed validation (fire-and-forget)
      trackValidation({
        tokenId: extractTokenId(token),
        success: false,
        reason: result.reason,
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      // All failures get same generic message (security)
      // Rate limiter counts this as failure (non-2xx response)
      return res.status(400).json({
        error: 'This link is no longer valid.',
        action: 'request_new'
      });
    }

    // Track successful validation (fire-and-forget)
    trackValidation({
      tokenId: result.decoded.jti,
      success: true,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      graceUsed: result.graceUsed || false
    });

    // Phase 71.2 / Plan 03 hotfix — include the user's profile TZ so the
    // availability form renders slot labels in the user's saved timezone
    // (Denver, NY, etc.) instead of falling back to the browser's detected
    // timezone, which is wrong when the browser is on a different machine
    // than where the user normally games.
    let profileTimezone = null;
    try {
      const dbUser = await User.findOne({
        where: { user_id: result.decoded.sub },
        attributes: ['timezone'],
      });
      profileTimezone = dbUser?.timezone || null;
    } catch (tzErr) {
      // Non-fatal — frontend falls back to browser TZ if profileTimezone is null.
      console.error('[magic-auth] failed to look up profile TZ:', tzErr.message);
    }

    // Success response with info needed by frontend
    res.json({
      valid: true,
      user: {
        name: result.decoded.name,  // For "Submitting as [Name]" UI
        timezone: profileTimezone,
      },
      prompt_id: result.decoded.prompt_id,
      expiresAt: result.tokenRecord.expires_at,
      graceUsed: result.graceUsed || false
    });

  } catch (err) {
    // Track server error (fire-and-forget)
    trackValidation({
      tokenId: extractTokenId(token),
      success: false,
      reason: 'server_error',
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    console.error('Token validation error:', err);
    res.status(500).json({
      error: 'Validation failed',
      action: 'request_new'
    });
  }
});

/**
 * POST /api/magic-auth/request-new
 * Stub endpoint for requesting a new magic link (Phase 4 will implement)
 */
router.post('/request-new', async (req, res) => {
  // Placeholder - will be implemented in Phase 4 when prompt/email integration is complete
  res.status(501).json({
    error: 'This feature will be available soon.',
    message: 'Please ask the group organizer to resend the availability prompt.'
  });
});

module.exports = router;
