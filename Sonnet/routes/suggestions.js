// routes/suggestions.js
// REST API endpoints for smart game suggestions.
// Mounted at /api/suggestions (auth required via server.js verifyAuth0Token).

const express = require('express');
const { Event, UserGroup } = require('../models');
const { getSuggestions } = require('../services/suggestionService');
const router = express.Router();

// ============================================
// Helper: verify user is active group member
// ============================================

async function isActiveMember(auth0UserId, groupId) {
  const membership = await UserGroup.findOne({
    where: {
      user_id: auth0UserId,
      group_id: groupId,
      status: 'active',
    },
  });
  return !!membership;
}

// ============================================
// GET /event/:eventId
// Suggestions for a specific event (player count from RSVPs)
// ============================================

router.get('/event/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { maxPlayTime, minWeight, maxWeight, sort } = req.query;
    const auth0UserId = req.user.sub;

    // Look up event to get group_id
    const event = await Event.findByPk(eventId);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Verify requesting user is an active group member
    const isMember = await isActiveMember(auth0UserId, event.group_id);
    if (!isMember) {
      return res.status(403).json({ error: 'You must be an active group member to view suggestions' });
    }

    const result = await getSuggestions({
      groupId: event.group_id,
      eventId,
      maxPlayTime,
      minWeight,
      maxWeight,
      sort,
    });

    return res.json({
      suggestions: result.suggestions,
      player_count: result.playerCount,
    });
  } catch (err) {
    console.error('Suggestions event error:', err);
    return res.status(500).json({ error: 'Failed to fetch suggestions' });
  }
});

// ============================================
// GET /group/:groupId
// Suggestions for a group (player count required)
// ============================================

router.get('/group/:groupId', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { playerCount, maxPlayTime, minWeight, maxWeight, sort } = req.query;
    const auth0UserId = req.user.sub;

    if (!playerCount) {
      return res.status(400).json({ error: 'playerCount query parameter is required' });
    }

    const parsedPlayerCount = parseInt(playerCount, 10);
    if (isNaN(parsedPlayerCount) || parsedPlayerCount < 1) {
      return res.status(400).json({ error: 'playerCount must be a positive integer' });
    }

    // Verify requesting user is an active group member
    const isMember = await isActiveMember(auth0UserId, groupId);
    if (!isMember) {
      return res.status(403).json({ error: 'You must be an active group member to view suggestions' });
    }

    const result = await getSuggestions({
      groupId,
      playerCount: parsedPlayerCount,
      maxPlayTime,
      minWeight,
      maxWeight,
      sort,
    });

    return res.json({
      suggestions: result.suggestions,
      player_count: result.playerCount,
    });
  } catch (err) {
    console.error('Suggestions group error:', err);
    return res.status(500).json({ error: 'Failed to fetch suggestions' });
  }
});

module.exports = router;
