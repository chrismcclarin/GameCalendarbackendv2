const { Queue } = require('bullmq');
const Redis = require('ioredis');

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null, // REQUIRED for BullMQ blocking commands
  enableReadyCheck: false
});

const deadlineQueue = new Queue('deadlines', {
  connection,
  defaultJobOptions: {
    attempts: 2,              // Fewer retries — deadline enforcement is time-sensitive
    backoff: { type: 'fixed', delay: 10000 },
    removeOnComplete: 500,
    removeOnFail: false       // Keep all failed jobs for debugging
  }
});

module.exports = deadlineQueue;
