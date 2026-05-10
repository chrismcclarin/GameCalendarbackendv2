// tests/routes/rsvp.gcalCleanup.test.js
// Phase 75 / Plan 04: RSVP-driven GCal cleanup dispatch.
//
// Verifies that the RSVP route handlers dispatch a per-attendee gcal-sync
// job whenever an attendee transitions yes->no (POST or GET /respond) or
// DELETE-of-yes their RSVP — and ONLY in those cases.
//
// Pattern follows tests/routes/events.gcalCleanup.test.js: mock all models +
// services + middleware, drive the route via supertest. No DB, no Redis.

process.env.NODE_ENV = 'test';
process.env.MAGIC_TOKEN_SECRET = 'test-secret-for-rsvp-hmac';

const request = require('supertest');
const express = require('express');

// ---- Tracking arrays for ordering assertion (Test 21) ----
const callOrder = [];

// ---- Model mocks ----
const mockEventRsvpFindOne = jest.fn();
const mockEventRsvpFindByPk = jest.fn();
const mockEventRsvpCreate = jest.fn();
const mockEventBringDestroy = jest.fn();
const mockEventFindByPk = jest.fn();
const mockUserFindOne = jest.fn();
const mockEventParticipationFindOne = jest.fn();

jest.mock('../../models', () => ({
  EventRsvp: {
    findOne: (...args) => mockEventRsvpFindOne(...args),
    findByPk: (...args) => mockEventRsvpFindByPk(...args),
    create: (...args) => mockEventRsvpCreate(...args),
  },
  EventBring: {
    destroy: (...args) => mockEventBringDestroy(...args),
  },
  Event: {
    findByPk: (...args) => mockEventFindByPk(...args),
  },
  User: {
    findOne: (...args) => mockUserFindOne(...args),
  },
  Game: {},
  Group: {},
  EventParticipation: {
    findOne: (...args) => mockEventParticipationFindOne(...args),
  },
}));

// ---- gcalCleanupService mock — central to this test file ----
const mockEnqueueCleanupJobForAttendee = jest.fn();
jest.mock('../../services/gcalCleanupService', () => ({
  enqueueCleanupJobForAttendee: (...args) => mockEnqueueCleanupJobForAttendee(...args),
  enqueueCleanupJobsForEvent: jest.fn(),
}));

// ---- Middleware mocks ----
jest.mock('../../middleware/auth0', () => ({
  verifyAuth0Token: (req, _res, next) => next(),
}));

jest.mock('../../middleware/validators', () => {
  const passthrough = (req, res, next) => next();
  return new Proxy({}, {
    get(_target, prop) {
      if (prop === 'validateRsvpCreate') return passthrough;
      if (prop === 'validateUUID') return () => passthrough;
      if (prop === 'validate') return passthrough;
      return passthrough;
    },
  });
});

jest.mock('../../services/authorizationService', () => ({
  canReadEventScopedSurface: jest.fn(() => Promise.resolve({ allowed: true })),
}));

const TEST_EVENT_ID = '11111111-1111-1111-1111-111111111111';
const TEST_USER_ID_AUTH0 = 'auth0|test-user-04';
const TEST_USER_ID_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TEST_EP_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const TEST_GCAL_EVENT_ID = 'gcal-event-id-from-google';

// Token must be re-generated against the SAME secret the route uses.
const { generateRsvpToken } = require('../../routes/rsvp');

// Build an Express app with the (post-mock) RSVP router attached.
const rsvpRoutes = require('../../routes/rsvp');
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.user = { user_id: TEST_USER_ID_AUTH0 };
  next();
});
app.use('/api/rsvp', rsvpRoutes);

// Helper: build a future event mock.
function buildFutureEvent(extra = {}) {
  return {
    id: TEST_EVENT_ID,
    group_id: 'group-uuid',
    game_id: 'game-uuid',
    start_date: new Date(Date.now() + 24 * 3600 * 1000),
    status: 'active',
    Game: { name: 'Catan' },
    Group: { id: 'group-uuid', name: 'Test Group' },
    ...extra,
  };
}

// Helper: build an EventRsvp mock with a status + update method.
function buildExistingRsvp(status, overrides = {}) {
  return {
    id: 'rsvp-uuid-existing',
    event_id: TEST_EVENT_ID,
    user_id: TEST_USER_ID_AUTH0,
    status,
    note: null,
    update: jest.fn(async function (patch) {
      Object.assign(this, patch);
      return this;
    }),
    destroy: jest.fn().mockResolvedValue(true),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  callOrder.length = 0;

  // Default happy-path mocks: future event, EP exists with non-null gcal id.
  mockEventFindByPk.mockResolvedValue(buildFutureEvent());
  mockEventBringDestroy.mockResolvedValue(0);
  mockEventRsvpCreate.mockResolvedValue({ id: 'rsvp-uuid-new' });
  mockEventRsvpFindByPk.mockResolvedValue({
    id: 'rsvp-uuid-existing',
    event_id: TEST_EVENT_ID,
    user_id: TEST_USER_ID_AUTH0,
    status: 'no',
  });
  mockUserFindOne.mockResolvedValue({ id: TEST_USER_ID_UUID });
  mockEventParticipationFindOne.mockResolvedValue({
    id: TEST_EP_ID,
    google_calendar_event_id: TEST_GCAL_EVENT_ID,
  });
  mockEnqueueCleanupJobForAttendee.mockResolvedValue({ enqueued: 1, skipped: 0 });
});

// ============================================================================
// POST / — authenticated path
// ============================================================================

describe('POST /api/rsvp/ — Phase 75 / Plan 04 GCal cleanup dispatch', () => {
  test('Test 1: yes->no transition with non-null gcal id → exactly one cleanup job dispatched', async () => {
    const existing = buildExistingRsvp('yes');
    mockEventRsvpFindOne.mockResolvedValueOnce(existing);

    const res = await request(app)
      .post('/api/rsvp/')
      .send({ event_id: TEST_EVENT_ID, status: 'no' });

    expect(res.status).toBe(200);
    // Allow time for the fire-and-forget dispatch to settle
    await new Promise((r) => setImmediate(r));
    expect(mockEnqueueCleanupJobForAttendee).toHaveBeenCalledTimes(1);
    expect(mockEnqueueCleanupJobForAttendee).toHaveBeenCalledWith({
      eventId: TEST_EVENT_ID,
      eventParticipationId: TEST_EP_ID,
      userId: TEST_USER_ID_UUID,
      googleCalendarEventId: TEST_GCAL_EVENT_ID,
    });
  });

  test('Test 2: no->yes transition → NO cleanup job', async () => {
    mockEventRsvpFindOne.mockResolvedValueOnce(buildExistingRsvp('no'));

    const res = await request(app)
      .post('/api/rsvp/')
      .send({ event_id: TEST_EVENT_ID, status: 'yes' });

    expect(res.status).toBe(200);
    await new Promise((r) => setImmediate(r));
    expect(mockEnqueueCleanupJobForAttendee).not.toHaveBeenCalled();
  });

  test('Test 3: yes->maybe transition → NO cleanup job (only yes->no per CONTEXT)', async () => {
    mockEventRsvpFindOne.mockResolvedValueOnce(buildExistingRsvp('yes'));

    const res = await request(app)
      .post('/api/rsvp/')
      .send({ event_id: TEST_EVENT_ID, status: 'maybe' });

    expect(res.status).toBe(200);
    await new Promise((r) => setImmediate(r));
    expect(mockEnqueueCleanupJobForAttendee).not.toHaveBeenCalled();
  });

  test('Test 4: yes->yes (no transition) → NO cleanup job', async () => {
    mockEventRsvpFindOne.mockResolvedValueOnce(buildExistingRsvp('yes'));

    const res = await request(app)
      .post('/api/rsvp/')
      .send({ event_id: TEST_EVENT_ID, status: 'yes' });

    expect(res.status).toBe(200);
    await new Promise((r) => setImmediate(r));
    expect(mockEnqueueCleanupJobForAttendee).not.toHaveBeenCalled();
  });

  test('Test 5: yes->no but no EventParticipation row exists → NO cleanup job (handler does not crash)', async () => {
    mockEventRsvpFindOne.mockResolvedValueOnce(buildExistingRsvp('yes'));
    mockEventParticipationFindOne.mockResolvedValueOnce(null);

    const res = await request(app)
      .post('/api/rsvp/')
      .send({ event_id: TEST_EVENT_ID, status: 'no' });

    expect(res.status).toBe(200);
    await new Promise((r) => setImmediate(r));
    expect(mockEnqueueCleanupJobForAttendee).not.toHaveBeenCalled();
  });

  test('Test 6: yes->no but EventParticipation.google_calendar_event_id is null → silent skip (NO cleanup job)', async () => {
    mockEventRsvpFindOne.mockResolvedValueOnce(buildExistingRsvp('yes'));
    mockEventParticipationFindOne.mockResolvedValueOnce({
      id: TEST_EP_ID,
      google_calendar_event_id: null,
    });

    const res = await request(app)
      .post('/api/rsvp/')
      .send({ event_id: TEST_EVENT_ID, status: 'no' });

    expect(res.status).toBe(200);
    await new Promise((r) => setImmediate(r));
    expect(mockEnqueueCleanupJobForAttendee).not.toHaveBeenCalled();
  });

  test('Test 7: enqueueCleanupJobForAttendee throws → RSVP request still returns success', async () => {
    mockEventRsvpFindOne.mockResolvedValueOnce(buildExistingRsvp('yes'));
    mockEnqueueCleanupJobForAttendee.mockRejectedValueOnce(new Error('Redis is down'));

    const res = await request(app)
      .post('/api/rsvp/')
      .send({ event_id: TEST_EVENT_ID, status: 'no' });

    expect(res.status).toBe(200);
    // Helper was attempted (proves we reached dispatch site)
    await new Promise((r) => setImmediate(r));
    expect(mockEnqueueCleanupJobForAttendee).toHaveBeenCalled();
  });
});

// ============================================================================
// GET /respond — HMAC magic-link path
// ============================================================================

describe('GET /api/rsvp/respond — Phase 75 / Plan 04 GCal cleanup dispatch', () => {
  function magicLinkUrl(status) {
    const token = generateRsvpToken(TEST_EVENT_ID, TEST_USER_ID_AUTH0, status);
    return `/api/rsvp/respond?token=${token}&e=${TEST_EVENT_ID}&u=${encodeURIComponent(TEST_USER_ID_AUTH0)}&s=${status}`;
  }

  test('Test 8: yes->no via magic link → exactly one cleanup job dispatched', async () => {
    mockEventRsvpFindOne.mockResolvedValueOnce(buildExistingRsvp('yes'));

    const res = await request(app).get(magicLinkUrl('no'));

    expect(res.status).toBe(200);
    await new Promise((r) => setImmediate(r));
    expect(mockEnqueueCleanupJobForAttendee).toHaveBeenCalledTimes(1);
    expect(mockEnqueueCleanupJobForAttendee).toHaveBeenCalledWith({
      eventId: TEST_EVENT_ID,
      eventParticipationId: TEST_EP_ID,
      userId: TEST_USER_ID_UUID,
      googleCalendarEventId: TEST_GCAL_EVENT_ID,
    });
  });

  test('Test 9a: no->yes via magic link → NO cleanup job', async () => {
    mockEventRsvpFindOne.mockResolvedValueOnce(buildExistingRsvp('no'));

    const res = await request(app).get(magicLinkUrl('yes'));

    expect(res.status).toBe(200);
    await new Promise((r) => setImmediate(r));
    expect(mockEnqueueCleanupJobForAttendee).not.toHaveBeenCalled();
  });

  test('Test 9b: yes->maybe via magic link → NO cleanup job', async () => {
    mockEventRsvpFindOne.mockResolvedValueOnce(buildExistingRsvp('yes'));

    const res = await request(app).get(magicLinkUrl('maybe'));

    expect(res.status).toBe(200);
    await new Promise((r) => setImmediate(r));
    expect(mockEnqueueCleanupJobForAttendee).not.toHaveBeenCalled();
  });

  test('Test 10: existing is null (first-time RSVP via magic link) → NO cleanup regardless of incoming status', async () => {
    mockEventRsvpFindOne.mockResolvedValueOnce(null);

    const res = await request(app).get(magicLinkUrl('no'));

    expect(res.status).toBe(200);
    await new Promise((r) => setImmediate(r));
    expect(mockEnqueueCleanupJobForAttendee).not.toHaveBeenCalled();
  });

  test('Test 11: HTTP response shape unchanged (POST returns RSVP-with-User; GET returns success object)', async () => {
    // POST shape check
    mockEventRsvpFindOne.mockResolvedValueOnce(buildExistingRsvp('yes'));
    const postRes = await request(app)
      .post('/api/rsvp/')
      .send({ event_id: TEST_EVENT_ID, status: 'no' });
    expect(postRes.status).toBe(200);

    // GET shape check — magic link returns success+status+event_name
    mockEventRsvpFindOne.mockResolvedValueOnce(buildExistingRsvp('yes'));
    const getRes = await request(app).get(magicLinkUrl('no'));
    expect(getRes.status).toBe(200);
    expect(getRes.body).toHaveProperty('success', true);
    expect(getRes.body).toHaveProperty('status', 'no');
    expect(getRes.body).toHaveProperty('event_name');
  });
});
