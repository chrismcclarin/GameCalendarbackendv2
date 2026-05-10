// tests/services/gcalSyncQueue.config.test.js
// Phase 75 / Plan 02 -- unit tests for the gcal-sync BullMQ queue config.
//
// Plan 75-02 ships only the queue/worker infrastructure. These tests lock
// the contract Plan 75-03 will rely on:
//   1. Queue identity ('gcal-sync')
//   2. Retry config matches CONTEXT D-RETRY (3 attempts, exponential backoff,
//      removeOnFail=false so failed jobs stay in Bull Board for ops debugging)
//   3. Worker is bound to the same queue name
//   4. Bull Board route registers the queue (source-level inspection -- avoids
//      booting express + Redis just to verify wiring)
//
// BullMQ Queue construction is synchronous and does NOT connect to Redis until
// the first command, so the queue-identity + config assertions run without a
// live Redis. The worker DOES connect on construction; we always close it in
// afterAll so jest exits cleanly even when REDIS_URL points at a missing host.

const fs = require('fs');
const path = require('path');

const { gcalSyncQueue } = require('../../queues');
const gcalSyncWorker = require('../../workers/gcalSyncWorker');

afterAll(async () => {
  // Close both the queue (and its underlying ioredis connection) and the worker
  // so jest's --detectOpenHandles run is clean.
  await gcalSyncWorker.close();
  await gcalSyncQueue.close();
});

describe('gcal-sync queue config (Phase 75 / Plan 02)', () => {
  test('queue identity is "gcal-sync"', () => {
    expect(gcalSyncQueue.name).toBe('gcal-sync');
  });

  test('retry config matches CONTEXT D-RETRY (3 attempts, exponential backoff, removeOnFail=false)', () => {
    const opts = gcalSyncQueue.defaultJobOptions;
    expect(opts.attempts).toBe(3);
    expect(opts.backoff).toBeDefined();
    expect(opts.backoff.type).toBe('exponential');
    expect(typeof opts.backoff.delay).toBe('number');
    expect(opts.backoff.delay).toBeGreaterThan(0);
    expect(opts.removeOnFail).toBe(false); // keep failed jobs for debugging
  });

  test('worker is bound to the same queue name', () => {
    expect(gcalSyncWorker.name).toBe('gcal-sync');
  });

  test('Bull Board route registers gcalSyncQueue', () => {
    // Source-level assertion -- lighter weight than booting express + Redis.
    const bullBoardSrc = fs.readFileSync(
      path.join(__dirname, '..', '..', 'routes', 'bullBoard.js'),
      'utf8'
    );
    expect(bullBoardSrc).toMatch(/BullMQAdapter\(gcalSyncQueue\)/);
    // Also verify the destructured import was updated.
    expect(bullBoardSrc).toMatch(/gcalSyncQueue.*require\(['"]\.\.\/queues['"]\)/);
  });
});
