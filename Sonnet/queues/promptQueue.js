const { Queue } = require('bullmq');
const Redis = require('ioredis');

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null, // REQUIRED for BullMQ blocking commands
  enableReadyCheck: false
});

const promptQueue = new Queue('prompts', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 1000, // Keep last 1000 completed jobs
    removeOnFail: false      // Keep all failed jobs for debugging
  }
});

module.exports = promptQueue;
