// workers/promptWorker.js
// Processes scheduled prompt sending jobs
const { Worker } = require('bullmq');
const Redis = require('ioredis');
const { AvailabilityPrompt, Group, GroupPromptSettings, UserGroup, User } = require('../models');
const magicTokenService = require('../services/magicTokenService');
const emailService = require('../services/emailService');

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false
});

// Helper: Get ISO week identifier (e.g., "2026-W07")
function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

// Helper: Calculate deadline from hours
function calculateDeadline(deadlineHours) {
  return new Date(Date.now() + deadlineHours * 60 * 60 * 1000);
}

const promptWorker = new Worker('prompts', async (job) => {
  const { groupId, settingsId, timezone } = job.data;
  console.log(`[PromptWorker] Processing job for group ${groupId}`);

  // Idempotency check: avoid duplicate prompts for same week
  const weekIdentifier = getISOWeek(new Date());

  const existingPrompt = await AvailabilityPrompt.findOne({
    where: { group_id: groupId, week_identifier: weekIdentifier }
  });

  if (existingPrompt) {
    console.log(`[PromptWorker] Prompt already exists for ${weekIdentifier}, skipping`);
    return { skipped: true, reason: 'duplicate_week', promptId: existingPrompt.id };
  }

  // Get settings for deadline calculation
  const settings = await GroupPromptSettings.findByPk(settingsId);
  if (!settings) {
    throw new Error(`GroupPromptSettings ${settingsId} not found`);
  }

  const deadline = calculateDeadline(settings.default_deadline_hours || 72);

  // Create the prompt
  const prompt = await AvailabilityPrompt.create({
    group_id: groupId,
    prompt_date: new Date(),
    deadline,
    status: 'pending',
    week_identifier: weekIdentifier,
    auto_schedule_enabled: true,
    blind_voting_enabled: settings.template_config?.blind_voting || false
  });

  // Get group members
  const memberships = await UserGroup.findAll({
    where: { group_id: groupId },
    include: [{
      model: User,
      required: true
    }]
  });

  const group = await Group.findByPk(groupId);
  let emailsSent = 0;

  // Send emails to each member
  for (const membership of memberships) {
    const user = membership.User;
    if (!user.email || user.email.includes('@auth0')) continue;

    try {
      // Generate magic token for this user
      const tokenData = await magicTokenService.generateToken(user.user_id, prompt.id);

      // TODO: Use proper email template (Phase 2 availability prompt template)
      // For now, send simple notification
      const availabilityUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/availability/${tokenData.token}`;

      await emailService.send({
        to: user.email,
        subject: `${group.name} - When are you available?`,
        html: `<p>Hi ${user.username || 'there'},</p>
               <p>${group.name} is looking to schedule a game session.</p>
               <p><a href="${availabilityUrl}">Click here to submit your availability</a></p>
               <p>This link expires in 72 hours.</p>`,
        text: `Hi ${user.username || 'there'},\n\n${group.name} is looking to schedule a game session.\n\nSubmit your availability: ${availabilityUrl}\n\nThis link expires in 72 hours.`,
        groupName: group.name,
        promptId: prompt.id,
        emailType: 'availability_prompt'
      });
      emailsSent++;
    } catch (err) {
      console.error(`[PromptWorker] Failed to send email to ${user.email}:`, err.message);
    }
  }

  // Update prompt status to active
  await prompt.update({ status: 'active' });

  console.log(`[PromptWorker] Created prompt ${prompt.id}, sent ${emailsSent} emails`);
  return { promptId: prompt.id, recipientCount: emailsSent };
}, {
  connection,
  concurrency: 3 // Process up to 3 prompt jobs simultaneously
});

promptWorker.on('failed', (job, err) => {
  console.error(`[PromptWorker] Job ${job.id} failed:`, err.message);
});

promptWorker.on('completed', (job, result) => {
  console.log(`[PromptWorker] Job ${job.id} completed:`, result);
});

module.exports = promptWorker;
