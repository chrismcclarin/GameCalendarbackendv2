// workers/reminderWorker.js
// Processes reminder email jobs with frequency limit (max 2 per user per prompt)
const { Worker } = require('bullmq');
const Redis = require('ioredis');
const { AvailabilityPrompt, AvailabilityResponse, UserGroup, User, Group } = require('../models');
const { Op } = require('sequelize');
const emailService = require('../services/emailService');
const magicTokenService = require('../services/magicTokenService');

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false
});

const MAX_REMINDERS_PER_USER = 2;

const reminderWorker = new Worker('reminders', async (job) => {
  const { promptId, reminderType, groupId } = job.data;
  console.log(`[ReminderWorker] Processing ${reminderType} reminder for prompt ${promptId}`);

  // Verify prompt is still active
  const prompt = await AvailabilityPrompt.findByPk(promptId);
  if (!prompt || prompt.status !== 'active') {
    console.log(`[ReminderWorker] Prompt ${promptId} not active, skipping`);
    return { skipped: true, reason: 'prompt_not_active' };
  }

  // Get group info
  const group = await Group.findByPk(prompt.group_id);
  if (!group) {
    return { skipped: true, reason: 'group_not_found' };
  }

  // Get group members
  const memberships = await UserGroup.findAll({
    where: { group_id: prompt.group_id },
    include: [{
      model: User,
      where: { email_notifications_enabled: { [Op.ne]: false } },
      required: true
    }]
  });

  // Find who has already responded (submitted_at is not null)
  const responses = await AvailabilityResponse.findAll({
    where: {
      prompt_id: promptId,
      submitted_at: { [Op.ne]: null }
    }
  });
  const respondedUserIds = new Set(responses.map(r => r.user_id));

  let remindersSent = 0;
  let skipped = 0;

  for (const membership of memberships) {
    const user = membership.User;
    const userId = membership.user_id;

    // Skip if already responded
    if (respondedUserIds.has(userId)) {
      continue;
    }

    // Skip invalid emails
    if (!user.email || user.email.includes('@auth0')) {
      continue;
    }

    // Check reminder count (max 2 per prompt per user)
    let existingResponse = await AvailabilityResponse.findOne({
      where: { prompt_id: promptId, user_id: userId }
    });

    const reminderCount = existingResponse?.reminder_count || 0;
    if (reminderCount >= MAX_REMINDERS_PER_USER) {
      console.log(`[ReminderWorker] User ${userId} already received ${reminderCount} reminders, skipping`);
      skipped++;
      continue;
    }

    try {
      // Generate new magic token for reminder email
      const tokenData = await magicTokenService.generateToken(userId, promptId);
      const availabilityUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/availability/${tokenData.token}`;

      // Send reminder email
      const reminderLabel = reminderType === '50-percent' ? 'halfway' : 'final';
      await emailService.send({
        to: user.email,
        subject: `Reminder: ${group.name} - Submit your availability`,
        html: `<p>Hi ${user.username || 'there'},</p>
               <p>This is a ${reminderLabel} reminder to submit your availability for ${group.name}.</p>
               <p><a href="${availabilityUrl}">Click here to submit your availability</a></p>
               <p>The deadline is approaching!</p>`,
        text: `Hi ${user.username || 'there'},\n\nThis is a ${reminderLabel} reminder to submit your availability for ${group.name}.\n\nSubmit your availability: ${availabilityUrl}\n\nThe deadline is approaching!`,
        groupName: group.name
      });

      // Track reminder (upsert to create or update placeholder record)
      if (existingResponse) {
        await existingResponse.update({
          last_reminded_at: new Date(),
          reminder_count: reminderCount + 1
        });
      } else {
        await AvailabilityResponse.create({
          prompt_id: promptId,
          user_id: userId,
          time_slots: [],
          user_timezone: 'UTC',
          submitted_at: null, // Not submitted yet - this is a placeholder
          last_reminded_at: new Date(),
          reminder_count: 1
        });
      }

      remindersSent++;
    } catch (err) {
      console.error(`[ReminderWorker] Failed to send reminder to ${user.email}:`, err.message);
    }
  }

  console.log(`[ReminderWorker] Sent ${remindersSent} reminders, skipped ${skipped} (max reached)`);
  return { promptId, reminderType, remindersSent, skipped };
}, {
  connection,
  concurrency: 2 // Lower concurrency for reminders to avoid email rate limits
});

reminderWorker.on('failed', (job, err) => {
  console.error(`[ReminderWorker] Job ${job.id} failed:`, err.message);
});

reminderWorker.on('completed', (job, result) => {
  console.log(`[ReminderWorker] Job ${job.id} completed:`, result);
});

module.exports = reminderWorker;
