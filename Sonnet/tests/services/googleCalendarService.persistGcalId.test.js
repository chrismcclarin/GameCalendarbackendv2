// tests/services/googleCalendarService.persistGcalId.test.js
// Phase 75 / GCAL-01: verify createCalendarEventsForGroup returns the data
// the caller needs to persist google_calendar_event_id on every connected
// attendee's EventParticipation row (Plan 75-01 Task 2).
//
// The route-side persistence call (EventParticipation.update) is exercised
// via the service's return contract: each result object must expose
//   - gcal_event_id          (the GCal event id, shared across host + invitees)
//   - connected_member_ids   (uuids of attendees with GCal connected)
// so the create-event handler can call:
//   EventParticipation.update(
//     { google_calendar_event_id: gcal_event_id },
//     { where: { event_id, user_id: connected_member_ids } }
//   )

// Mock googleapis BEFORE requiring the service so the OAuth2 client and
// calendar.events.insert are stubbed.
const mockEventsInsert = jest.fn();
const mockSetCredentials = jest.fn();
const mockOAuth2 = jest.fn().mockImplementation(() => ({
  setCredentials: mockSetCredentials,
}));

jest.mock('googleapis', () => ({
  google: {
    auth: { OAuth2: mockOAuth2 },
    calendar: jest.fn(() => ({
      events: { insert: mockEventsInsert },
    })),
  },
}));

// Mock models so the in-service token-refresh side-effect (User.update) is a no-op.
jest.mock('../../models', () => ({
  User: { update: jest.fn().mockResolvedValue([1]) },
}));

const googleCalendarService = require('../../services/googleCalendarService');

describe('googleCalendarService.createCalendarEventsForGroup persistence contract', () => {
  const eventData = {
    start_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // tomorrow
    duration_minutes: 90,
    game_name: 'Catan',
    comments: 'Bring snacks',
    timezone: 'America/Los_Angeles',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: GCal API returns a stable fake event id
    mockEventsInsert.mockResolvedValue({
      data: {
        id: 'gcal-evt-abc123',
        htmlLink: 'https://calendar.google.com/event?eid=fake',
      },
    });
  });

  it('returns gcal_event_id and connected_member_ids covering ALL connected attendees (Test 1)', async () => {
    // Three attendees: two connected to GCal, one not.
    const groupMembers = [
      {
        id: 'uuid-host',
        email: 'host@example.com',
        google_calendar_enabled: true,
        google_calendar_token: 'token-host',
        google_calendar_refresh_token: 'refresh-host',
      },
      {
        id: 'uuid-connected-2',
        email: 'connected2@example.com',
        google_calendar_enabled: true,
        google_calendar_token: 'token-2',
        google_calendar_refresh_token: 'refresh-2',
      },
      {
        id: 'uuid-not-connected',
        email: 'notconnected@example.com',
        google_calendar_enabled: false,
        google_calendar_token: null,
      },
    ];

    const results = await googleCalendarService.createCalendarEventsForGroup(eventData, groupMembers);

    // Exactly one GCal API call (the existing single-host pattern).
    expect(mockEventsInsert).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(1);

    const [r] = results;
    // New contract: gcal_event_id matches the API's returned event id.
    expect(r.gcal_event_id).toBe('gcal-evt-abc123');
    // New contract: connected_member_ids contains EVERY connected attendee, not just the host.
    expect(r.connected_member_ids).toEqual(
      expect.arrayContaining(['uuid-host', 'uuid-connected-2'])
    );
    expect(r.connected_member_ids).toHaveLength(2);
    expect(r.connected_member_ids).not.toContain('uuid-not-connected');

    // Existing contract preserved (additive change, no breaks).
    expect(r.member_id).toBe('uuid-host');
    expect(r.calendar_event).toBeDefined();
    expect(r.calendar_event.id).toBe('gcal-evt-abc123');
    expect(r.invitations_sent_to).toEqual(
      expect.arrayContaining(['host@example.com', 'connected2@example.com', 'notconnected@example.com'])
    );
  });

  it('connected_member_ids omits attendees without GCal token (Test 2)', async () => {
    const groupMembers = [
      {
        id: 'uuid-host',
        email: 'host@example.com',
        google_calendar_enabled: true,
        google_calendar_token: 'token-host',
      },
      {
        id: 'uuid-no-token',
        email: 'notoken@example.com',
        google_calendar_enabled: true, // enabled but no token (e.g., revoked)
        google_calendar_token: null,
      },
      {
        id: 'uuid-disabled',
        email: 'disabled@example.com',
        google_calendar_enabled: false,
        google_calendar_token: 'stale-token', // token present but disabled
      },
    ];

    const [r] = await googleCalendarService.createCalendarEventsForGroup(eventData, groupMembers);

    expect(r.connected_member_ids).toEqual(['uuid-host']);
    // Caller will only update the host's EventParticipation row.
    // The other two stay null — exactly matching the must-have:
    // "Users not connected to Google Calendar have NULL google_calendar_event_id".
  });

  it('returns empty array when no members have GCal connected — caller persistence is a no-op (Test 3)', async () => {
    const groupMembers = [
      {
        id: 'uuid-1',
        email: 'a@example.com',
        google_calendar_enabled: false,
        google_calendar_token: null,
      },
      {
        id: 'uuid-2',
        email: 'b@example.com',
        google_calendar_enabled: true,
        google_calendar_token: null,
      },
    ];

    const results = await googleCalendarService.createCalendarEventsForGroup(eventData, groupMembers);

    // No API call made.
    expect(mockEventsInsert).not.toHaveBeenCalled();
    // Empty results -> route-side `if (calendarResults.length > 0 && ...)` short-circuits.
    expect(results).toEqual([]);
  });

  it('returns empty array when GCal API fails — no partial persistence data (Test 4)', async () => {
    mockEventsInsert.mockRejectedValueOnce(new Error('Google API 503'));

    const groupMembers = [
      {
        id: 'uuid-host',
        email: 'host@example.com',
        google_calendar_enabled: true,
        google_calendar_token: 'token-host',
      },
    ];

    const results = await googleCalendarService.createCalendarEventsForGroup(eventData, groupMembers);

    // The existing inner try/catch swallows the API error and returns the
    // (still-empty) results array. Route-side `calendarResults.length > 0`
    // gate keeps the persistence step from running, so no rows get a
    // partial / wrong gcal id.
    expect(results).toEqual([]);
  });

  it('the route-side update query shape is well-formed for persistence', async () => {
    // This test documents the consumer contract used by routes/events.js:
    //   EventParticipation.update(
    //     { google_calendar_event_id: <gcal_event_id> },
    //     { where: { event_id: <event uuid>, user_id: <connected_member_ids> } }
    //   )
    // It locks in the field names the route handler reads from the result.
    const groupMembers = [
      {
        id: 'uuid-host',
        email: 'host@example.com',
        google_calendar_enabled: true,
        google_calendar_token: 'token-host',
      },
      {
        id: 'uuid-attendee',
        email: 'a@example.com',
        google_calendar_enabled: true,
        google_calendar_token: 'token-a',
      },
    ];

    const [r] = await googleCalendarService.createCalendarEventsForGroup(eventData, groupMembers);

    // What the route reads:
    expect(typeof r.gcal_event_id).toBe('string');
    expect(r.gcal_event_id.length).toBeGreaterThan(0);
    expect(Array.isArray(r.connected_member_ids)).toBe(true);
    expect(r.connected_member_ids.every(id => typeof id === 'string')).toBe(true);

    // What the route would build:
    const updatePayload = { google_calendar_event_id: r.gcal_event_id };
    const whereClause = { event_id: 'event-uuid-fixture', user_id: r.connected_member_ids };
    expect(updatePayload.google_calendar_event_id).toBe('gcal-evt-abc123');
    expect(whereClause.user_id).toEqual(['uuid-host', 'uuid-attendee']);
  });
});
