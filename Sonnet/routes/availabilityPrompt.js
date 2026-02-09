// routes/availabilityPrompt.js
// Routes for availability prompt management: respondent tracking and reminders

const express = require('express');
const router = express.Router();
const { verifyAuth0Token } = require('../middleware/auth0');
const {
  AvailabilityPrompt,
  AvailabilityResponse,
  User,
  UserGroup,
  Group,
  Game
} = require('../models');
const emailService = require('../services/emailService');

/**
 * GET /api/prompts/:promptId/respondents
 * Get list of all group members with their response status for a prompt
 *
 * Protected by Auth0 token
 * Returns: Array of { user_id, username, has_responded, slot_count, submitted_at, last_reminded_at }
 *
 * For blind voting:
 * - Admins see who responded (not slot details)
 * - Non-admins see only their own status before submitting
 */
router.get('/prompts/:promptId/respondents', verifyAuth0Token, async (req, res) => {
  try {
    const { promptId } = req.params;
    const requestingUserId = req.user.sub;

    // 1. Get prompt with group
    const prompt = await AvailabilityPrompt.findByPk(promptId, {
      include: [{ model: Group }]
    });

    if (!prompt) {
      return res.status(404).json({ error: 'Prompt not found' });
    }

    // 2. Verify requester is a member of the group
    const requesterGroup = await UserGroup.findOne({
      where: { group_id: prompt.group_id, user_id: requestingUserId }
    });

    if (!requesterGroup) {
      return res.status(403).json({ error: 'You must be a member of this group' });
    }

    const isAdmin = ['owner', 'admin'].includes(requesterGroup.role);

    // 3. Get all group members
    const groupMembers = await UserGroup.findAll({
      where: { group_id: prompt.group_id },
      include: [{
        model: User,
        attributes: ['user_id', 'username', 'email']
      }]
    });

    // 4. Get all responses for this prompt
    const responses = await AvailabilityResponse.findAll({
      where: { prompt_id: promptId }
    });

    // Create a map of responses by user_id
    const responseMap = new Map();
    responses.forEach(r => {
      responseMap.set(r.user_id, r);
    });

    // 5. Check if current user has responded (for blind voting visibility)
    const userHasResponded = responseMap.has(requestingUserId);
    const pollClosed = prompt.status === 'closed' || prompt.status === 'converted' ||
                       new Date(prompt.deadline) < new Date();

    // 6. Build respondent list with visibility rules
    const respondents = groupMembers.map(member => {
      const response = responseMap.get(member.user_id);
      const hasResponded = !!response && response.submitted_at !== null;

      // Calculate slot count
      let slotCount = 0;
      if (response && response.time_slots) {
        slotCount = Array.isArray(response.time_slots) ? response.time_slots.length : 0;
      }

      // Visibility for blind voting:
      // - If blind voting is enabled and poll is not closed and user hasn't responded:
      //   - Only show slot counts for admin (who can see who responded)
      //   - Non-admins only see their own data
      const showSlotCount = !prompt.blind_voting_enabled ||
                            pollClosed ||
                            userHasResponded ||
                            isAdmin ||
                            member.user_id === requestingUserId;

      return {
        user_id: member.user_id,
        username: member.User?.username || 'Unknown',
        has_responded: hasResponded,
        slot_count: showSlotCount ? slotCount : null,
        submitted_at: hasResponded ? response.submitted_at : null,
        last_reminded_at: response?.last_reminded_at || null
      };
    });

    // Sort: responded first, then alphabetically
    respondents.sort((a, b) => {
      if (a.has_responded !== b.has_responded) {
        return a.has_responded ? -1 : 1;
      }
      return (a.username || '').localeCompare(b.username || '');
    });

    res.json(respondents);

  } catch (error) {
    console.error('Error getting respondents:', error);
    res.status(500).json({ error: 'Failed to get respondents' });
  }
});


/**
 * POST /api/prompts/:promptId/remind/:userId
 * Send reminder email to a non-respondent
 *
 * Protected by Auth0 token (admin/owner only)
 * Enforces 24-hour cooldown per user
 */
router.post('/prompts/:promptId/remind/:userId', verifyAuth0Token, async (req, res) => {
  try {
    const { promptId, userId } = req.params;
    const requestingUserId = req.user.sub;

    // 1. Get prompt with group and game
    const prompt = await AvailabilityPrompt.findByPk(promptId, {
      include: [
        { model: Group },
        { model: Game }
      ]
    });

    if (!prompt) {
      return res.status(404).json({ error: 'Prompt not found' });
    }

    // 2. Verify requester is admin/owner of the group
    const userGroup = await UserGroup.findOne({
      where: { group_id: prompt.group_id, user_id: requestingUserId }
    });

    if (!userGroup || !['owner', 'admin'].includes(userGroup.role)) {
      return res.status(403).json({ error: 'Only admins can send reminders' });
    }

    // 3. Check if prompt is still active
    if (prompt.status !== 'active' && prompt.status !== 'pending') {
      return res.status(400).json({ error: 'Cannot send reminders for closed prompts' });
    }

    // 4. Check cooldown - find or create response record
    let response = await AvailabilityResponse.findOne({
      where: { prompt_id: promptId, user_id: userId }
    });

    if (response?.last_reminded_at) {
      const hoursSince = (Date.now() - new Date(response.last_reminded_at)) / (1000 * 60 * 60);
      if (hoursSince < 24) {
        const nextAvailable = new Date(new Date(response.last_reminded_at).getTime() + 24 * 60 * 60 * 1000);
        return res.status(429).json({
          error: 'Cannot remind user more than once per 24 hours',
          next_reminder_available: nextAvailable.toISOString()
        });
      }
    }

    // 5. Check if user has already responded
    if (response?.submitted_at) {
      return res.status(400).json({ error: 'User has already submitted their availability' });
    }

    // 6. Get target user
    const targetUser = await User.findOne({ where: { user_id: userId } });
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // 7. Verify target user is in the group
    const targetUserGroup = await UserGroup.findOne({
      where: { group_id: prompt.group_id, user_id: userId }
    });
    if (!targetUserGroup) {
      return res.status(400).json({ error: 'User is not a member of this group' });
    }

    // 8. Send reminder email
    const gameName = prompt.Game?.name || 'game night';
    const groupName = prompt.Group?.name || 'your group';
    const deadline = new Date(prompt.deadline).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });

    const emailResult = await emailService.send({
      to: targetUser.email,
      subject: `Reminder: ${groupName} availability request`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4F46E5;">Availability Reminder</h2>
          <p>Hi ${targetUser.username || 'there'},</p>
          <p>This is a friendly reminder to submit your availability for the upcoming <strong>${gameName}</strong> session with <strong>${groupName}</strong>.</p>
          <p>The deadline to respond is <strong>${deadline}</strong>.</p>
          <p>Please check your email for the original availability link, or contact your group admin if you need a new one.</p>
          <p style="color: #6B7280; font-size: 12px; margin-top: 30px;">
            This is an automated reminder from NextGameNight.
          </p>
        </div>
      `,
      text: `Hi ${targetUser.username || 'there'},\n\nThis is a friendly reminder to submit your availability for the upcoming ${gameName} session with ${groupName}.\n\nThe deadline to respond is ${deadline}.\n\nPlease check your email for the original availability link, or contact your group admin if you need a new one.`,
      groupName: groupName
    });

    if (!emailResult.success) {
      console.error('Failed to send reminder email:', emailResult.error);
      return res.status(500).json({ error: 'Failed to send reminder email' });
    }

    // 9. Update or create response record with last_reminded_at
    if (response) {
      await response.update({ last_reminded_at: new Date() });
    } else {
      // Create a placeholder response record to track reminder
      await AvailabilityResponse.create({
        prompt_id: promptId,
        user_id: userId,
        time_slots: [],
        user_timezone: 'UTC',
        submitted_at: null, // Not submitted yet
        last_reminded_at: new Date()
      });
    }

    res.json({
      success: true,
      message: `Reminder sent to ${targetUser.username || targetUser.email}`
    });

  } catch (error) {
    console.error('Error sending reminder:', error);
    res.status(500).json({ error: 'Failed to send reminder' });
  }
});


module.exports = router;
