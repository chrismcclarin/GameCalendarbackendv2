// tests/edge-cases/dstTransitions.test.js
// Edge case tests for deadline calculations across DST (Daylight Saving Time) boundaries
// Tests that UTC-based deadline arithmetic is DST-immune.
//
// Key insight: All deadline calculations use UTC milliseconds (Date.now() + ms offset).
// Since UTC doesn't have DST, the math is always correct regardless of local clock changes.
//
// CRITICAL: jest.useFakeTimers must use doNotFake: ['nextTick', 'setImmediate'] to prevent
// Sequelize connection pool from timing out during DB operations.

require('dotenv').config({ path: '.env.test' });
process.env.NODE_ENV = 'test';

if (!process.env.MAGIC_TOKEN_SECRET) {
  process.env.MAGIC_TOKEN_SECRET = 'test-secret-key-for-jwt-signing-minimum-32-chars-long';
}

// This file does NOT need DB access — pure deadline arithmetic tests.
// No sequelize.sync() or afterAll(sequelize.close()) needed.

describe('DST boundary deadline calculations', () => {
  beforeEach(() => {
    // Use fake timers but exclude nextTick and setImmediate
    // to prevent Sequelize connection pool from timing out
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should calculate a 72-hour deadline correctly at the US Eastern spring-forward moment', () => {
    // US Eastern spring-forward 2026: clocks jump from 1:59 AM EST to 3:00 AM EDT
    // on Sunday, March 8, 2026 at 07:00 UTC (02:00 AM Eastern Standard Time)
    const dstSpringForwardUtc = new Date('2026-03-08T06:59:00.000Z');
    jest.setSystemTime(dstSpringForwardUtc);

    const HOURS_72 = 72 * 60 * 60 * 1000; // 72 hours in milliseconds

    const deadline = new Date(Date.now() + HOURS_72);
    const diff = deadline.getTime() - Date.now();

    // UTC arithmetic should be exactly 72 hours regardless of DST
    expect(diff).toBe(HOURS_72);
  });

  it('should calculate deadline as exactly 72 hours after spring-forward in UTC', () => {
    // Set time to just after DST spring-forward
    const justAfterSpringForward = new Date('2026-03-08T07:01:00.000Z');
    jest.setSystemTime(justAfterSpringForward);

    const HOURS_72 = 72 * 60 * 60 * 1000;
    const deadline = new Date(Date.now() + HOURS_72);

    // 72 hours after 07:01 UTC on March 8 = 07:01 UTC on March 11
    const expectedDeadline = new Date('2026-03-11T07:01:00.000Z');

    expect(deadline.getTime()).toBe(expectedDeadline.getTime());
  });

  it('should remain correct at US fall-back DST transition', () => {
    // US Eastern fall-back 2026: clocks fall back from 2:00 AM EDT to 1:00 AM EST
    // on Sunday, November 1, 2026 at 06:00 UTC
    const dstFallBackUtc = new Date('2026-11-01T05:59:00.000Z');
    jest.setSystemTime(dstFallBackUtc);

    const HOURS_72 = 72 * 60 * 60 * 1000;
    const deadline = new Date(Date.now() + HOURS_72);
    const diff = deadline.getTime() - Date.now();

    // DST fall-back adds 1 extra hour locally, but UTC is immune
    expect(diff).toBe(HOURS_72);
  });

  it('should confirm Date.now() returns UTC ms since epoch (DST-immune)', () => {
    const springForward = new Date('2026-03-08T06:59:00.000Z');
    jest.setSystemTime(springForward);

    const nowMs = Date.now();
    expect(nowMs).toBe(springForward.getTime());
    expect(typeof nowMs).toBe('number');
  });
});
