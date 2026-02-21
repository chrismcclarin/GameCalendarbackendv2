// workers/promptWorker.js
// Processes scheduled prompt sending jobs
const { Worker } = require('bullmq');
const Redis = require('ioredis');
const { AvailabilityPrompt, Group, GroupPromptSettings, UserGroup, User } = require('../models');
const magicTokenService = require('../services/magicTokenService');
const emailService = require('../services/emailService');
const { scheduleReminders, scheduleDeadlineJob } = require('../services/reminderService');

function buildPromptEmailHtml({ recipientName, groupName, weekDescription, responseDeadline, formUrl }) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f6f9fc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:20px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;max-width:600px;width:100%">
        <tr><td style="padding:32px 40px">
          <h1 style="margin:0 0 16px;font-size:24px;font-weight:bold;color:#111827">Hey ${recipientName}!</h1>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#333">${groupName} is planning a game session! Let us know when you're free ${weekDescription}.</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;text-align:center">
            <tr><td align="center">
              <a href="${formUrl}" target="_blank" style="display:inline-block;padding:12px 24px;background:#4F46E5;color:#fff;text-decoration:none;border-radius:5px;font-weight:bold;font-size:16px">When Can You Play?</a>
            </td></tr>
          </table>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#333">Please respond by ${responseDeadline} so we can find a time that works for everyone.</p>
        </td></tr>
        <tr><td style="padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center">
          <p style="margin:0;font-size:12px;color:#6b7280">Sent by NextGameNight on behalf of ${groupName}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// Optional Sentry integration
let Sentry = null;
if (process.env.SENTRY_DSN) {
  try {
    Sentry = require('@sentry/node');
  } catch (err) {
    console.warn('[PromptWorker] Sentry not available:', err.message);
  }
}

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
      const token = await magicTokenService.generateToken(
        { user_id: user.user_id, username: user.username },
        { id: prompt.id },
        settings.default_token_expiry_hours
      );
      const availabilityUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/availability-form/${token}`;

      const recipientName = user.username || 'there';
      const deadlineStr = prompt.deadline
        ? prompt.deadline.toLocaleString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric',
            hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
          })
        : 'soon';
      const html = buildPromptEmailHtml({ recipientName, groupName: group.name, weekDescription: weekIdentifier, responseDeadline: deadlineStr, formUrl: availabilityUrl });
      const text = `Hi ${recipientName},\n\n${group.name} is planning a game session! Let us know when you're free ${weekIdentifier}.\n\nRespond here: ${availabilityUrl}\n\nPlease respond by ${deadlineStr}.\n\nSent by NextGameNight on behalf of ${group.name}`;

      await emailService.send({
        to: user.email,
        subject: `${group.name} - When are you available?`,
        html,
        text,
        groupName: group.name,
        promptId: prompt.id,
        emailType: 'availability_prompt'
      });
      emailsSent++;
      if (Sentry) {
        Sentry.metrics.count('availability_email.sent', 1, {
          attributes: { group_id: String(groupId), email_type: 'availability_prompt' }
        });
      }
    } catch (err) {
      console.error(`[PromptWorker] Failed to send email to ${user.email}:`, err.message);
    }
  }

  // Update prompt status to active
  await prompt.update({ status: 'active' });
  if (Sentry) {
    Sentry.metrics.count('availability_prompt.created', 1, {
      attributes: { group_id: String(groupId) }
    });
  }

  // Schedule reminder and deadline jobs now that the prompt is active
  try {
    await scheduleReminders(prompt);
    await scheduleDeadlineJob(prompt);
  } catch (scheduleErr) {
    // Log but don't fail the job — emails were already sent
    console.error(`[PromptWorker] Failed to schedule reminders/deadline for ${prompt.id}:`, scheduleErr.message);
  }

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
