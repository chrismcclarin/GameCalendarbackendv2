// routes/availabilityPrefill.js
// Magic-token-authenticated pre-fill endpoints for the check-in availability flow.
// NOTE: This route uses magic token auth, NOT Auth0.
//
// Phase 81 Plan 02 (CHKIN-05): adds POST /gcal — returns slot IDs for slots
// where the magic-token user is FREE (no overlapping GCal busy event) in the
// requested week. Plan 03 (CHKIN-06) will add POST /saved in the same file.

const express = require('express');
const router = express.Router();

const { User } = require('../models');
const { validateToken } = require('../services/magicTokenService');
const googleCalendarService = require('../services/googleCalendarService');
const availabilityService = require('../services/availabilityService');
const { magicTokenLimiter } = require('../middleware/rateLimiter');

/**
 * Inline IANA timezone validator. The availabilityService module has a
 * top-level `isValidTimezone` helper but doesn't expose it on the singleton
 * (the only thing the module exports). Re-implementing the same Intl-backed
 * check here keeps the dependency surface tight and matches research V5.
 */
function isValidTimezone(tz) {
  if (!tz || typeof tz !== 'string') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * POST /api/availability-prefill/gcal
 *
 * Magic-token authenticated (NOT Auth0). Returns slot IDs for slots where the
 * user is FREE (no GCal busy events touching the slot) in the requested week.
 *
 * Conservative-overlap mapping (CONTEXT D-CHKIN-05): if a GCal busy event
 * touches ANY part of a 30-min slot, that slot is treated as busy and is NOT
 * included in the response. Backed by `googleCalendarService.getBusyTimesForDateRange`
 * which already uses floor-start / ceil-end slot anchoring.
 *
 * Token is NOT consumed (consume: false) — the user still needs the token to
 * submit the actual response.
 *
 * Request body: {
 *   magic_token: string,            // Required - magic token from email link
 *   start_date: "YYYY-MM-DD",       // Required - Monday of the target week (client computes via nextMonday(now))
 *   num_days: number (1-14),        // Required - typically 7
 *   timezone: string                // Required - IANA timezone (e.g. 'America/Los_Angeles')
 * }
 *
 * Response:
 *   Success: { slot_ids: ["2026-05-19T02:00:00.000Z", ...], count: N }
 *   Validation error: { error: string }
 *   Token error: { error: string, action: 'request_new' }
 */
router.post('/gcal', magicTokenLimiter, async (req, res) => {
  try {
    const { magic_token, start_date, num_days, timezone } = req.body;

    // ---- Input validation ----
    if (!magic_token || typeof magic_token !== 'string') {
      return res.status(400).json({ error: 'magic_token is required' });
    }
    if (!start_date || typeof start_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(start_date)) {
      return res.status(400).json({ error: 'start_date must be YYYY-MM-DD' });
    }
    const numDaysInt = parseInt(num_days, 10);
    if (!Number.isFinite(numDaysInt) || numDaysInt < 1 || numDaysInt > 14) {
      return res.status(400).json({ error: 'num_days must be an integer 1-14' });
    }
    if (!timezone || !isValidTimezone(timezone)) {
      return res.status(400).json({ error: 'timezone must be a valid IANA timezone' });
    }

    // ---- Magic-token validation (consume: false — DO NOT invalidate the token) ----
    const tokenResult = await validateToken(magic_token, null, { consume: false });
    if (!tokenResult.valid) {
      return res.status(400).json({
        error: 'This link is no longer valid.',
        action: 'request_new'
      });
    }
    const userId = tokenResult.decoded.sub;

    // ---- Load user, verify GCal still connected ----
    const user = await User.findOne({ where: { user_id: userId } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (!user.google_calendar_enabled || !user.google_calendar_token) {
      return res.status(400).json({ error: 'Google Calendar is not connected' });
    }

    // ---- Compute date range ----
    // start_date is the Monday the client computed via nextMonday(now); we trust
    // it verbatim to avoid client/server divergence at the timezone boundary
    // (research Pitfall 4).
    const startDate = new Date(`${start_date}T00:00:00.000Z`);
    const endDate = new Date(startDate);
    endDate.setUTCDate(endDate.getUTCDate() + numDaysInt);

    // ---- Fetch GCal busy + build free-slot set ----
    const busySlots = await googleCalendarService.getBusyTimesForDateRange(
      user, startDate, endDate, timezone
    );
    const busyKeys = new Set(busySlots.map(s => `${s.date}_${s.startTime}`));

    const allSlots = availabilityService.generateTimeSlots(startDate, endDate, timezone);
    const freeSlotIds = allSlots
      .filter(s => !busyKeys.has(`${s.date}_${s.startTime}`))
      .map(s => new Date(`${s.date}T${s.startTime}:00.000Z`).toISOString());

    return res.json({ slot_ids: freeSlotIds, count: freeSlotIds.length });
  } catch (err) {
    console.error('[availability-prefill/gcal] error:', err);
    return res.status(500).json({ error: 'Failed to compute GCal pre-fill' });
  }
});

module.exports = router;
