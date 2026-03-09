// routes/rsvp.js
// RSVP CRUD API endpoints for event responses (yes/no/maybe)
const express = require('express');
const { EventRsvp, Event, User, UserGroup, Game } = require('../models');
const { validateRsvpCreate } = require('../middleware/validators');
const router = express.Router();

// Helper: verify user is an active member of the event's group
const verifyUserInGroup = async (auth0UserId, groupId) => {
  const userGroup = await UserGroup.findOne({
    where: {
      user_id: auth0UserId,
      group_id: groupId,
      status: 'active',
    },
  });
  return !!userGroup;
};

// POST / -- Create or update RSVP (upsert pattern)
router.post('/', validateRsvpCreate, async (req, res) => {
  try {
    const { event_id, status, note } = req.body;
    const auth0UserId = req.user.user_id;

    // Look up the event (must exist and not be cancelled)
    const event = await Event.findByPk(event_id);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    if (event.status === 'cancelled') {
      return res.status(400).json({ error: 'Cannot RSVP to a cancelled event' });
    }

    // Verify user is an active member of the event's group
    const isMember = await verifyUserInGroup(auth0UserId, event.group_id);
    if (!isMember) {
      return res.status(403).json({ error: 'You must be an active member of this group to RSVP' });
    }

    // Upsert: find existing RSVP or create new
    const existing = await EventRsvp.findOne({
      where: { event_id, user_id: auth0UserId },
    });

    let rsvp;
    let isCreate = false;

    if (existing) {
      // Update existing RSVP
      await existing.update({ status, note: note || null });
      rsvp = existing;
    } else {
      // Create new RSVP
      rsvp = await EventRsvp.create({
        event_id,
        user_id: auth0UserId,
        status,
        note: note || null,
      });
      isCreate = true;
    }

    // Re-fetch with User include for response
    const result = await EventRsvp.findByPk(rsvp.id, {
      include: [{ model: User, attributes: ['id', 'username', 'user_id'] }],
    });

    return res.status(isCreate ? 201 : 200).json(result);
  } catch (error) {
    console.error('Error creating/updating RSVP:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// GET /event/:event_id -- Get all RSVPs for an event
router.get('/event/:event_id', async (req, res) => {
  try {
    const { event_id } = req.params;
    const auth0UserId = req.user.user_id;

    // Look up the event
    const event = await Event.findByPk(event_id);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Verify user is an active member of the event's group
    const isMember = await verifyUserInGroup(auth0UserId, event.group_id);
    if (!isMember) {
      return res.status(403).json({ error: 'You must be an active member of this group to view RSVPs' });
    }

    // Fetch all RSVPs for this event
    const rsvps = await EventRsvp.findAll({
      where: { event_id },
      include: [{ model: User, attributes: ['id', 'username', 'user_id'] }],
      order: [
        // Custom order: yes first, maybe second, no third
        [EventRsvp.sequelize.literal(`CASE WHEN "EventRsvp"."status" = 'yes' THEN 0 WHEN "EventRsvp"."status" = 'maybe' THEN 1 WHEN "EventRsvp"."status" = 'no' THEN 2 END`), 'ASC'],
        ['createdAt', 'ASC'],
      ],
    });

    // Compute summary counts
    const summary = { yes: 0, maybe: 0, no: 0 };
    rsvps.forEach((r) => {
      if (summary.hasOwnProperty(r.status)) {
        summary[r.status]++;
      }
    });

    return res.json({ rsvps, summary });
  } catch (error) {
    console.error('Error fetching event RSVPs:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// GET /user/:user_id -- Get all RSVPs for a user (across events)
router.get('/user/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;
    const auth0UserId = req.user.user_id;

    // Only allow users to fetch their own RSVPs
    if (auth0UserId !== user_id) {
      return res.status(403).json({ error: 'You can only view your own RSVPs' });
    }

    const rsvps = await EventRsvp.findAll({
      where: { user_id },
      include: [
        {
          model: Event,
          attributes: ['id', 'start_date', 'group_id', 'game_id', 'status'],
          include: [
            { model: Game, attributes: ['id', 'name'] },
          ],
        },
      ],
      order: [[Event, 'start_date', 'DESC']],
    });

    return res.json(rsvps);
  } catch (error) {
    console.error('Error fetching user RSVPs:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// DELETE /:rsvp_id -- Remove an RSVP
router.delete('/:rsvp_id', async (req, res) => {
  try {
    const { rsvp_id } = req.params;
    const auth0UserId = req.user.user_id;

    const rsvp = await EventRsvp.findByPk(rsvp_id);
    if (!rsvp) {
      return res.status(404).json({ error: 'RSVP not found' });
    }

    // Only the RSVP owner can delete it
    if (rsvp.user_id !== auth0UserId) {
      return res.status(403).json({ error: 'You can only remove your own RSVP' });
    }

    await rsvp.destroy();
    return res.status(200).json({ message: 'RSVP removed' });
  } catch (error) {
    console.error('Error removing RSVP:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
