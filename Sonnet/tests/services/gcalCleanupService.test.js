// tests/services/gcalCleanupService.test.js
// Phase 75 / Plan 03: tests for the GCal-cleanup dispatcher service AND the
// underlying googleCalendarService.deleteCalendarEventForUser helper.
//
// Two suites:
//   A. deleteCalendarEventForUser  - error classification contract for the worker
//   B. gcalCleanupService          - per-attendee enqueue, null-skip, dedupe, best-effort

// ---------------------------------------------------------------------------
// Mock googleapis BEFORE requiring services that build OAuth2 clients on
// construction. mockEventsDelete is the function we steer per-test.
// ---------------------------------------------------------------------------
const mockEventsDelete = jest.fn();
const mockSetCredentials = jest.fn();
const mockRefreshAccessToken = jest.fn();
const mockOAuth2 = jest.fn().mockImplementation(() => ({
  setCredentials: mockSetCredentials,
  refreshAccessToken: mockRefreshAccessToken,
}));

jest.mock('googleapis', () => ({
  google: {
    auth: { OAuth2: mockOAuth2 },
    calendar: jest.fn(() => ({
      events: { delete: mockEventsDelete },
    })),
  },
}));

// Mock models — gcalCleanupService imports EventParticipation; the
// googleCalendarService also touches User.update on token refresh in OTHER
// methods, but deleteCalendarEventForUser does not, so we keep the mock minimal.
const mockEventParticipationFindAll = jest.fn();
jest.mock('../../models', () => ({
  EventParticipation: { findAll: mockEventParticipationFindAll },
  User: { update: jest.fn() },
}));

// Mock the queue — we want spyable add() without booting Redis.
const mockQueueAdd = jest.fn();
jest.mock('../../queues', () => ({
  gcalSyncQueue: {
    add: (...args) => mockQueueAdd(...args),
    name: 'gcal-sync',
  },
}));

const googleCalendarService = require('../../services/googleCalendarService');
const {
  enqueueCleanupJobsForEvent,
  enqueueCleanupJobForAttendee,
} = require('../../services/gcalCleanupService');

// Helper: build a Google-API style error with the given http code.
function gcalError(code, message = `mock GCal ${code}`) {
  const err = new Error(message);
  err.code = code;
  return err;
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default: queue.add resolves successfully.
  mockQueueAdd.mockResolvedValue({ id: 'mock-job-id' });
});

// ---------------------------------------------------------------------------
// SUITE A: deleteCalendarEventForUser
// ---------------------------------------------------------------------------
describe('googleCalendarService.deleteCalendarEventForUser (Phase 75 / Plan 03)', () => {
  test('1a: success — calls events.delete with primary+sendUpdates=none and resolves { deleted: true }', async () => {
    mockEventsDelete.mockResolvedValueOnce({});

    const result = await googleCalendarService.deleteCalendarEventForUser(
      'gcal-evt-1',
      'access-token',
      'refresh-token'
    );

    expect(result).toEqual({ deleted: true });
    expect(mockEventsDelete).toHaveBeenCalledTimes(1);
    expect(mockEventsDelete).toHaveBeenCalledWith({
      calendarId: 'primary',
      eventId: 'gcal-evt-1',
      sendUpdates: 'none',
    });
  });

  test('1b: 401 + refresh token — refreshes and retries once, returns _new_access_token', async () => {
    mockEventsDelete
      .mockRejectedValueOnce(gcalError(401))
      .mockResolvedValueOnce({}); // second call (after refresh) succeeds
    mockRefreshAccessToken.mockResolvedValueOnce({
      credentials: { access_token: 'new-access-token' },
    });

    const result = await googleCalendarService.deleteCalendarEventForUser(
      'gcal-evt-2',
      'expired-token',
      'refresh-token'
    );

    expect(result).toMatchObject({ deleted: true, _new_access_token: 'new-access-token' });
    expect(mockEventsDelete).toHaveBeenCalledTimes(2);
  });

  test('1c: 404 — resolves successfully (already deleted, idempotent)', async () => {
    mockEventsDelete.mockRejectedValueOnce(gcalError(404));

    const result = await googleCalendarService.deleteCalendarEventForUser(
      'gcal-evt-3',
      'token',
      'refresh'
    );

    expect(result).toEqual({ deleted: true, alreadyGone: true });
  });

  test('1d: 410 — resolves successfully (already deleted)', async () => {
    mockEventsDelete.mockRejectedValueOnce(gcalError(410));

    const result = await googleCalendarService.deleteCalendarEventForUser(
      'gcal-evt-4',
      'token',
      'refresh'
    );

    expect(result).toEqual({ deleted: true, alreadyGone: true });
  });

  test('1e: 401 without refresh token — throws GCAL_DISCONNECTED', async () => {
    mockEventsDelete.mockRejectedValueOnce(gcalError(401));

    await expect(
      googleCalendarService.deleteCalendarEventForUser('gcal-evt-5', 'token', null)
    ).rejects.toMatchObject({ code: 'GCAL_DISCONNECTED' });
  });

  test('1e-bis: 401 with refresh token but refresh fails — throws GCAL_DISCONNECTED', async () => {
    mockEventsDelete.mockRejectedValueOnce(gcalError(401));
    mockRefreshAccessToken.mockRejectedValueOnce(new Error('invalid_grant'));

    await expect(
      googleCalendarService.deleteCalendarEventForUser('gcal-evt-5b', 'token', 'bad-refresh')
    ).rejects.toMatchObject({ code: 'GCAL_DISCONNECTED' });
  });

  test('1f: 5xx — throws original error so worker treats as transient', async () => {
    const err500 = gcalError(503, 'service unavailable');
    mockEventsDelete.mockRejectedValueOnce(err500);

    await expect(
      googleCalendarService.deleteCalendarEventForUser('gcal-evt-6', 'token', 'refresh')
    ).rejects.toBe(err500); // original re-thrown
  });

  test('1g: 403 — throws GCAL_PERMANENT', async () => {
    mockEventsDelete.mockRejectedValueOnce(gcalError(403, 'forbidden'));

    await expect(
      googleCalendarService.deleteCalendarEventForUser('gcal-evt-7', 'token', 'refresh')
    ).rejects.toMatchObject({ code: 'GCAL_PERMANENT' });
  });

  test('1h: 429 — throws GCAL_RATE_LIMITED', async () => {
    mockEventsDelete.mockRejectedValueOnce(gcalError(429, 'rate limited'));

    await expect(
      googleCalendarService.deleteCalendarEventForUser('gcal-evt-8', 'token', 'refresh')
    ).rejects.toMatchObject({ code: 'GCAL_RATE_LIMITED' });
  });

  test('no access token — throws GCAL_DISCONNECTED', async () => {
    await expect(
      googleCalendarService.deleteCalendarEventForUser('gcal-evt-9', null, 'refresh')
    ).rejects.toMatchObject({ code: 'GCAL_DISCONNECTED' });
    expect(mockEventsDelete).not.toHaveBeenCalled();
  });

  test('other 4xx (e.g. 400) — throws GCAL_PERMANENT', async () => {
    mockEventsDelete.mockRejectedValueOnce(gcalError(400, 'bad request'));

    await expect(
      googleCalendarService.deleteCalendarEventForUser('gcal-evt-10', 'token', 'refresh')
    ).rejects.toMatchObject({ code: 'GCAL_PERMANENT' });
  });
});

// ---------------------------------------------------------------------------
// SUITE B: gcalCleanupService.enqueueCleanupJobsForEvent / enqueueCleanupJobForAttendee
// ---------------------------------------------------------------------------
describe('gcalCleanupService.enqueueCleanupJobsForEvent (Phase 75 / Plan 03)', () => {
  test('2a: 3 EPs, 2 with non-null gcal id — queues exactly 2 jobs', async () => {
    mockEventParticipationFindAll.mockResolvedValueOnce([
      { id: 'ep-1', event_id: 'evt-1', user_id: 'u-1', google_calendar_event_id: 'gcal-1' },
      { id: 'ep-2', event_id: 'evt-1', user_id: 'u-2', google_calendar_event_id: null },
      { id: 'ep-3', event_id: 'evt-1', user_id: 'u-3', google_calendar_event_id: 'gcal-3' },
    ]);

    const result = await enqueueCleanupJobsForEvent({ eventId: 'evt-1' });

    expect(result).toEqual({ enqueued: 2, skipped: 1, errors: 0 });
    expect(mockQueueAdd).toHaveBeenCalledTimes(2);
  });

  test('2b: each job carries { eventId, eventParticipationId, userId, googleCalendarEventId }', async () => {
    mockEventParticipationFindAll.mockResolvedValueOnce([
      { id: 'ep-1', event_id: 'evt-1', user_id: 'u-1', google_calendar_event_id: 'gcal-1' },
    ]);

    await enqueueCleanupJobsForEvent({ eventId: 'evt-1' });

    expect(mockQueueAdd).toHaveBeenCalledWith(
      'cleanup',
      {
        eventId: 'evt-1',
        eventParticipationId: 'ep-1',
        userId: 'u-1',
        googleCalendarEventId: 'gcal-1',
      },
      expect.any(Object)
    );
  });

  test('2c: deterministic jobId of gcal-cleanup-${eventParticipationId} for dedupe', async () => {
    mockEventParticipationFindAll.mockResolvedValueOnce([
      { id: 'ep-42', event_id: 'evt-1', user_id: 'u-1', google_calendar_event_id: 'gcal-1' },
    ]);

    await enqueueCleanupJobsForEvent({ eventId: 'evt-1' });

    const optsArg = mockQueueAdd.mock.calls[0][2];
    expect(optsArg.jobId).toBe('gcal-cleanup-ep-42');
  });

  test('2d: all EPs with null gcal id — queues nothing, returns enqueued: 0', async () => {
    mockEventParticipationFindAll.mockResolvedValueOnce([
      { id: 'ep-1', event_id: 'evt-1', user_id: 'u-1', google_calendar_event_id: null },
      { id: 'ep-2', event_id: 'evt-1', user_id: 'u-2', google_calendar_event_id: null },
    ]);

    const result = await enqueueCleanupJobsForEvent({ eventId: 'evt-1' });

    expect(result).toEqual({ enqueued: 0, skipped: 2, errors: 0 });
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  test('2e: returns { enqueued, skipped, errors } counters', async () => {
    mockEventParticipationFindAll.mockResolvedValueOnce([]);

    const result = await enqueueCleanupJobsForEvent({ eventId: 'evt-empty' });

    expect(result).toEqual({ enqueued: 0, skipped: 0, errors: 0 });
  });

  test('2f: queue.add throws (Redis down) — does NOT crash, counts errors, returns', async () => {
    mockEventParticipationFindAll.mockResolvedValueOnce([
      { id: 'ep-1', event_id: 'evt-1', user_id: 'u-1', google_calendar_event_id: 'gcal-1' },
      { id: 'ep-2', event_id: 'evt-1', user_id: 'u-2', google_calendar_event_id: 'gcal-2' },
    ]);
    mockQueueAdd
      .mockRejectedValueOnce(new Error('Redis is down'))
      .mockRejectedValueOnce(new Error('Redis is down'));

    const result = await enqueueCleanupJobsForEvent({ eventId: 'evt-1' });

    expect(result).toEqual({ enqueued: 0, skipped: 0, errors: 2 });
  });

  test('best-effort: even when EventParticipation.findAll throws, returns counters and does not throw', async () => {
    mockEventParticipationFindAll.mockRejectedValueOnce(new Error('DB down'));

    const result = await enqueueCleanupJobsForEvent({ eventId: 'evt-1' });

    // Counters all zero — function never throws.
    expect(result).toEqual({ enqueued: 0, skipped: 0, errors: 0 });
  });
});

describe('gcalCleanupService.enqueueCleanupJobForAttendee (Phase 75 / Plan 03 — exported for Plan 75-04)', () => {
  test('valid input — enqueues 1 job with deterministic jobId', async () => {
    const result = await enqueueCleanupJobForAttendee({
      eventId: 'evt-1',
      eventParticipationId: 'ep-1',
      userId: 'u-1',
      googleCalendarEventId: 'gcal-1',
    });

    expect(result).toEqual({ enqueued: 1, skipped: 0 });
    expect(mockQueueAdd).toHaveBeenCalledWith(
      'cleanup',
      {
        eventId: 'evt-1',
        eventParticipationId: 'ep-1',
        userId: 'u-1',
        googleCalendarEventId: 'gcal-1',
      },
      { jobId: 'gcal-cleanup-ep-1' }
    );
  });

  test('null googleCalendarEventId — skip silently, no enqueue', async () => {
    const result = await enqueueCleanupJobForAttendee({
      eventId: 'evt-1',
      eventParticipationId: 'ep-1',
      userId: 'u-1',
      googleCalendarEventId: null,
    });

    expect(result).toEqual({ enqueued: 0, skipped: 1 });
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  test('queue.add throws — does not crash, returns errors counter', async () => {
    mockQueueAdd.mockRejectedValueOnce(new Error('Redis is down'));

    const result = await enqueueCleanupJobForAttendee({
      eventId: 'evt-1',
      eventParticipationId: 'ep-1',
      userId: 'u-1',
      googleCalendarEventId: 'gcal-1',
    });

    expect(result).toMatchObject({ enqueued: 0, errors: 1 });
  });
});
