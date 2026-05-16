// routes/magicAuth.js
// Magic link authentication endpoints for availability forms

const express = require('express');
const router = express.Router();
const { validateToken } = require('../services/magicTokenService');
const { magicTokenLimiter } = require('../middleware/rateLimiter');
const { trackValidation, extractTokenId } = require('../services/tokenAnalyticsService');
const { User, UserAvailability } = require('../models');

/**
 * POST /api/magic-auth/validate
 * Validates a magic token and returns user info for UI confirmation
 *
 * Body: { token: string, formLoadedAt?: string }
 * Response:
 *   Success: { valid: true, user: { name, timezone }, prompt_id, expiresAt, graceUsed,
 *             gcal_connected, has_saved_availability }
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
    //
    // Phase 81 / Plan 01 — also pull google_calendar_enabled + google_calendar_token
    // so we can return a gcal_connected boolean that gates pre-fill button
    // rendering in plans 02 + 03. The actual token is NEVER returned — only
    // the boolean. (Information-disclosure mitigation, research V4.)
    let profileTimezone = null;
    let gcalConnected = false;
    try {
      const dbUser = await User.findOne({
        where: { user_id: result.decoded.sub },
        attributes: ['timezone', 'google_calendar_enabled', 'google_calendar_token'],
      });
      profileTimezone = dbUser?.timezone || null;
      // Canonical "connected" check — both the flag AND a usable token must be
      // present. Mirrors googleAuth.js /google/status semantics so the button
      // doesn't appear for users with a stale token after a disconnect.
      gcalConnected = !!(dbUser?.google_calendar_enabled && dbUser?.google_calendar_token);
    } catch (tzErr) {
      // Non-fatal — frontend falls back to browser TZ if profileTimezone is null.
      console.error('[magic-auth] failed to look up user profile:', tzErr.message);
    }

    // Phase 81 / Plan 01 — boolean for "Use my saved availability" pre-fill
    // button. Source-of-truth is row count, NOT a derived isAvailable check
    // (research Pitfall 3: source: 'default' is the no-data fallback and
    // would falsely flip this on for users with zero stored patterns).
    let hasSavedAvailability = false;
    try {
      const savedCount = await UserAvailability.count({
        where: { user_id: result.decoded.sub },
      });
      hasSavedAvailability = savedCount > 0;
    } catch (countErr) {
      // Non-fatal — defaults to false (button just won't render).
      console.error('[magic-auth] failed to count saved availability:', countErr.message);
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
      graceUsed: result.graceUsed || false,
      // Phase 81 — pre-fill button gates (read by AvailabilityForm in 81-02 / 81-03)
      gcal_connected: gcalConnected,
      has_saved_availability: hasSavedAvailability,
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
