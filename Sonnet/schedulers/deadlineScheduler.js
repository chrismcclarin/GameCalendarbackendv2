// schedulers/deadlineScheduler.js
// Deadline scheduler for auto-scheduling events from availability prompts
const cron = require('node-cron');
const { AvailabilityPrompt, AvailabilitySuggestion, Group, User, UserGroup } = require('../models');
const { Op } = require('sequelize');
const eventCreationService = require('../services/eventCreationService');
const emailService = require('../services/emailService');

// Check interval - default every 5 minutes, configurable via env
const DEADLINE_CHECK_INTERVAL = process.env.DEADLINE_CHECK_INTERVAL || '*/5 * * * *';

/**
 * Process a single expired prompt with auto-scheduling
 * @param {Object} prompt - AvailabilityPrompt instance
 */
async function processExpiredPrompt(prompt) {
  console.log(`Processing expired prompt ${prompt.id} for group ${prompt.group_id}`);

  try {
    // Get best suggestion by score that meets minimum
    const bestSuggestion = await AvailabilitySuggestion.findOne({
      where: {
        prompt_id: prompt.id,
        meets_minimum: true,
        converted_to_event_id: null
      },
      order: [['score', 'DESC'], ['suggested_start', 'ASC']]
    });

    if (bestSuggestion) {
      // Auto-create event from best suggestion
      const event = await eventCreationService.convertSuggestionToEvent(
        bestSuggestion.id,
        null,  // No specific creator for auto-scheduled
        { isAutoScheduled: true }
      );

      // Update prompt status
      await prompt.update({ status: 'converted' });

      console.log(`Auto-created event ${event.id} from suggestion ${bestSuggestion.id}`);
    } else {
      // No viable suggestion - notify admin
      await notifyAdminNoConsensus(prompt);
      await prompt.update({ status: 'closed' });

      console.log(`No consensus for prompt ${prompt.id}, notified admins`);
    }
  } catch (error) {
    console.error(`Error processing prompt ${prompt.id}:`, error.message);
    // Don't update status on error - will retry next interval
  }
}

/**
 * Send notification to group admins when no consensus reached
 * @param {Object} prompt - AvailabilityPrompt instance
 */
async function notifyAdminNoConsensus(prompt) {
  // Get group with admin/owner users
  const group = await Group.findByPk(prompt.group_id);
  if (!group) return;

  // Get admin and owner user IDs
  const adminMemberships = await UserGroup.findAll({
    where: {
      group_id: prompt.group_id,
      role: { [Op.in]: ['owner', 'admin'] }
    }
  });

  const adminUserIds = adminMemberships.map(m => m.user_id);

  // Get admin user details
  const admins = await User.findAll({
    where: {
      user_id: adminUserIds,
      email_notifications_enabled: { [Op.ne]: false }
    }
  });

  // Filter valid emails
  const recipients = admins.filter(a =>
    a.email &&
    !a.email.includes('@auth0.local') &&
    !a.email.includes('@auth0')
  );

  if (recipients.length === 0) return;

  const { html, text } = emailService.generateNoConsensusEmailTemplate({
    groupName: group.name,
    promptId: prompt.id,
    dashboardUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/groups/${group.id}/prompts/${prompt.id}`
  });

  for (const admin of recipients) {
    await emailService.send({
      to: admin.email,
      subject: `No consensus reached - ${group.name} availability`,
      html,
      text,
      groupName: group.name
    });
  }
}

/**
 * Main scheduler job - runs every 5 minutes by default
 * Checks for expired prompts with auto_schedule_enabled and processes them
 */
const deadlineJob = cron.schedule(DEADLINE_CHECK_INTERVAL, async () => {
  console.log(`[${new Date().toISOString()}] Running deadline check...`);

  try {
    // Find prompts past deadline with auto-scheduling enabled and still active
    const expiredPrompts = await AvailabilityPrompt.findAll({
      where: {
        deadline: { [Op.lt]: new Date() },
        status: 'active',
        auto_schedule_enabled: true
      }
    });

    console.log(`Found ${expiredPrompts.length} expired prompts with auto-scheduling`);

    for (const prompt of expiredPrompts) {
      await processExpiredPrompt(prompt);
    }
  } catch (error) {
    console.error('Deadline scheduler error:', error);
  }
}, {
  scheduled: false,  // Don't start automatically - server.js will start it
  timezone: 'UTC'
});

module.exports = {
  deadlineJob,
  processExpiredPrompt,  // Export for testing
  notifyAdminNoConsensus // Export for testing
};
