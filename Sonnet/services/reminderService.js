// services/reminderService.js
// Schedules reminder and deadline jobs for availability prompts
const { reminderQueue, deadlineQueue } = require('../queues');

/**
 * Schedule reminder jobs for a prompt at 50% and 90% of deadline window
 * Uses custom job IDs to prevent duplicates
 * @param {Object} prompt - AvailabilityPrompt instance
 */
async function scheduleReminders(prompt) {
  const now = Date.now();
  const deadlineMs = new Date(prompt.deadline).getTime();
  const timeWindow = deadlineMs - now;

  // Don't schedule if deadline already passed
  if (timeWindow <= 0) {
    console.log(`[ReminderService] Deadline already passed for prompt ${prompt.id}, skipping reminders`);
    return { scheduled: false, reason: 'deadline_passed' };
  }

  // Calculate delays for 50% and 90% of window
  const delay50 = Math.floor(timeWindow * 0.5);
  const delay90 = Math.floor(timeWindow * 0.9);

  // Minimum delay of 5 minutes (avoid immediate reminders for short deadlines)
  const minDelay = 5 * 60 * 1000;

  const scheduled = [];

  // Schedule 50% reminder if there's enough time
  if (delay50 > minDelay) {
    await reminderQueue.add('send-reminder', {
      promptId: prompt.id,
      reminderType: '50-percent',
      groupId: prompt.group_id
    }, {
      delay: delay50,
      jobId: `reminder-50-${prompt.id}` // Prevents duplicates
    });
    scheduled.push('50-percent');
    console.log(`[ReminderService] Scheduled 50% reminder for prompt ${prompt.id} in ${Math.round(delay50 / 60000)} min`);
  }

  // Schedule 90% reminder if there's enough time (and it's after 50%)
  if (delay90 > minDelay && delay90 > delay50 + minDelay) {
    await reminderQueue.add('send-reminder', {
      promptId: prompt.id,
      reminderType: '90-percent',
      groupId: prompt.group_id
    }, {
      delay: delay90,
      jobId: `reminder-90-${prompt.id}` // Prevents duplicates
    });
    scheduled.push('90-percent');
    console.log(`[ReminderService] Scheduled 90% reminder for prompt ${prompt.id} in ${Math.round(delay90 / 60000)} min`);
  }

  return { scheduled: true, reminders: scheduled };
}

/**
 * Schedule deadline enforcement job for a prompt
 * This triggers auto-scheduling when deadline passes
 * @param {Object} prompt - AvailabilityPrompt instance
 */
async function scheduleDeadlineJob(prompt) {
  const now = Date.now();
  const deadlineMs = new Date(prompt.deadline).getTime();
  const delay = deadlineMs - now;

  // Don't schedule if deadline already passed
  if (delay <= 0) {
    console.log(`[ReminderService] Deadline already passed for prompt ${prompt.id}, skipping deadline job`);
    return { scheduled: false, reason: 'deadline_passed' };
  }

  await deadlineQueue.add('enforce-deadline', {
    promptId: prompt.id,
    groupId: prompt.group_id
  }, {
    delay,
    jobId: `deadline-${prompt.id}` // Prevents duplicates
  });

  console.log(`[ReminderService] Scheduled deadline job for prompt ${prompt.id} in ${Math.round(delay / 60000)} min`);
  return { scheduled: true, delayMs: delay };
}

/**
 * Cancel all scheduled jobs for a prompt (when prompt is deleted or closed early)
 * @param {string} promptId - Prompt ID
 */
async function cancelPromptJobs(promptId) {
  const jobIds = [
    `reminder-50-${promptId}`,
    `reminder-90-${promptId}`,
    `deadline-${promptId}`
  ];

  let cancelled = 0;
  for (const jobId of jobIds) {
    try {
      // Check reminder queue
      let job = await reminderQueue.getJob(jobId);
      if (job) {
        await job.remove();
        cancelled++;
        continue;
      }

      // Check deadline queue
      job = await deadlineQueue.getJob(jobId);
      if (job) {
        await job.remove();
        cancelled++;
      }
    } catch (err) {
      // Job might already be processed/removed
      console.log(`[ReminderService] Could not cancel job ${jobId}:`, err.message);
    }
  }

  console.log(`[ReminderService] Cancelled ${cancelled} jobs for prompt ${promptId}`);
  return { cancelled };
}

module.exports = {
  scheduleReminders,
  scheduleDeadlineJob,
  cancelPromptJobs
};
