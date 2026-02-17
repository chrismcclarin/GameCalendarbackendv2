// workers/deadlineWorker.js
// Processes deadline enforcement jobs - reuses existing Phase 7 logic
const { Worker } = require('bullmq');
const Redis = require('ioredis');
const { processExpiredPrompt } = require('../schedulers/deadlineScheduler');

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false
});

const deadlineWorker = new Worker('deadlines', async (job) => {
  const { promptId } = job.data;
  console.log(`[DeadlineWorker] Processing deadline for prompt ${promptId}`);

  // Reuse existing Phase 7 deadline processing logic
  // This handles: finding best suggestion, creating event or notifying admins
  const { AvailabilityPrompt } = require('../models');
  const prompt = await AvailabilityPrompt.findByPk(promptId);

  if (!prompt) {
    console.log(`[DeadlineWorker] Prompt ${promptId} not found, skipping`);
    return { skipped: true, reason: 'prompt_not_found' };
  }

  if (prompt.status !== 'active') {
    console.log(`[DeadlineWorker] Prompt ${promptId} status is ${prompt.status}, skipping`);
    return { skipped: true, reason: 'prompt_not_active', status: prompt.status };
  }

  await processExpiredPrompt(prompt);

  return { promptId, status: 'processed' };
}, {
  connection,
  concurrency: 5 // Process up to 5 deadline jobs simultaneously
});

deadlineWorker.on('failed', (job, err) => {
  console.error(`[DeadlineWorker] Job ${job.id} failed:`, err.message);
});

deadlineWorker.on('completed', (job, result) => {
  console.log(`[DeadlineWorker] Job ${job.id} completed:`, result);
});

module.exports = deadlineWorker;
