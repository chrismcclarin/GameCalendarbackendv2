// tests/services/availabilityService.heatmap.test.js
// Unit tests for getGroupHeatmap -- 30-min to 1-hour bucketing, poll merging, and heatmap normalization

// Mock models before requiring the service
jest.mock('../../models', () => {
  const mockGroup = {
    findByPk: jest.fn(),
  };
  const mockUserGroup = {};
  const mockUserAvailability = {
    findAll: jest.fn().mockResolvedValue([]),
  };
  const mockUser = {};
  const mockAvailabilityPrompt = {
    findAll: jest.fn().mockResolvedValue([]),
  };
  const mockAvailabilityResponse = {
    findAll: jest.fn().mockResolvedValue([]),
  };
  return {
    Group: mockGroup,
    UserGroup: mockUserGroup,
    UserAvailability: mockUserAvailability,
    User: mockUser,
    AvailabilityPrompt: mockAvailabilityPrompt,
    AvailabilityResponse: mockAvailabilityResponse,
  };
});

jest.mock('../../services/googleCalendarService', () => ({
  getBusyTimesForDateRange: jest.fn().mockResolvedValue([]),
}));

const availabilityService = require('../../services/availabilityService');
const { Group, UserAvailability, AvailabilityPrompt, AvailabilityResponse } = require('../../models');
const googleCalendarService = require('../../services/googleCalendarService');

describe('availabilityService.getGroupHeatmap', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no active prompts
    AvailabilityPrompt.findAll.mockResolvedValue([]);
    AvailabilityResponse.findAll.mockResolvedValue([]);
  });

  // Helper to build mock overlap data (what calculateGroupOverlaps returns)
  function buildOverlapSlot(date, timeSlot, availableMembers, totalMembers = 5) {
    const [h, m] = timeSlot.split(':').map(Number);
    const endMinutes = h * 60 + m + 30;
    const endH = String(Math.floor(endMinutes / 60) % 24).padStart(2, '0');
    const endM = String(endMinutes % 60).padStart(2, '0');
    return {
      date,
      timeSlot,
      endTime: `${endH}:${endM}`,
      availableCount: availableMembers.length,
      totalMembers,
      availableMembers: availableMembers.map(u => ({
        user_id: u.user_id,
        username: u.username,
        email: u.email || `${u.username.toLowerCase()}@test.com`,
      })),
      unavailableCount: totalMembers - availableMembers.length,
    };
  }

  const userA = { user_id: 'auth0|aaa', username: 'Alice', email: 'alice@test.com' };
  const userB = { user_id: 'auth0|bbb', username: 'Bob', email: 'bob@test.com' };
  const userC = { user_id: 'auth0|ccc', username: 'Carol', email: 'carol@test.com' };

  // Helper: mock calculateGroupOverlaps to return controlled data
  function mockOverlaps(overlaps) {
    jest.spyOn(availabilityService, 'calculateGroupOverlaps').mockResolvedValue(overlaps);
  }

  // Helper: mock Group.findByPk to return members
  function mockGroupMembers(members, hasAvailability = {}) {
    // hasAvailability: { 'auth0|xxx': true } means that user has availability data
    const groupUsers = members.map(m => ({
      ...m,
      id: m.id || m.user_id,
      google_calendar_enabled: m.google_calendar_enabled || false,
      google_calendar_token: m.google_calendar_token || null,
      google_calendar_refresh_token: null,
    }));

    Group.findByPk.mockResolvedValue({
      id: 'test-group-id',
      Users: groupUsers,
    });

    // Mock UserAvailability.findAll to return records for users marked as having data
    UserAvailability.findAll.mockImplementation(async ({ where }) => {
      if (hasAvailability[where.user_id]) {
        return [{ id: 'some-record', user_id: where.user_id, type: 'recurring_pattern' }];
      }
      return [];
    });
  }

  // ===================================
  // Test 1: AND logic -- available in both 30-min sub-slots
  // ===================================
  it('counts user as available when present in BOTH 30-min sub-slots for an hour', async () => {
    const overlaps = [
      // User A available in both 14:00 and 14:30
      buildOverlapSlot('2026-03-23', '14:00', [userA], 3),
      buildOverlapSlot('2026-03-23', '14:30', [userA], 3),
    ];
    mockOverlaps(overlaps);
    mockGroupMembers([userA, userB, userC], { 'auth0|aaa': true, 'auth0|bbb': true, 'auth0|ccc': true });

    const result = await availabilityService.getGroupHeatmap('test-group-id', '2026-03-23', 'UTC');

    const slot14 = result.slots.find(s => s.date === '2026-03-23' && s.hour === 14);
    expect(slot14).toBeDefined();
    expect(slot14.availableCount).toBe(1);
    expect(slot14.availableMembers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ user_id: 'auth0|aaa', username: 'Alice' })
      ])
    );
  });

  // ===================================
  // Test 2: AND logic -- NOT available when only in one sub-slot
  // ===================================
  it('counts user as NOT available when present in only ONE 30-min sub-slot (AND logic)', async () => {
    const overlaps = [
      // User A available at 14:00 but NOT at 14:30
      buildOverlapSlot('2026-03-23', '14:00', [userA], 3),
      buildOverlapSlot('2026-03-23', '14:30', [], 3),
    ];
    mockOverlaps(overlaps);
    mockGroupMembers([userA, userB, userC], { 'auth0|aaa': true, 'auth0|bbb': true, 'auth0|ccc': true });

    const result = await availabilityService.getGroupHeatmap('test-group-id', '2026-03-23', 'UTC');

    const slot14 = result.slots.find(s => s.date === '2026-03-23' && s.hour === 14);
    expect(slot14).toBeDefined();
    expect(slot14.availableCount).toBe(0);
    expect(slot14.availableMembers).toEqual([]);
  });

  // ===================================
  // Test 3: Slots outside 10am-11pm are excluded
  // ===================================
  it('excludes slots outside 10am-11pm range (09:00 and 23:00 excluded)', async () => {
    const overlaps = [
      // 09:00 and 09:30 -- should be excluded (before 10am)
      buildOverlapSlot('2026-03-23', '09:00', [userA], 3),
      buildOverlapSlot('2026-03-23', '09:30', [userA], 3),
      // 14:00 and 14:30 -- should be included
      buildOverlapSlot('2026-03-23', '14:00', [userA], 3),
      buildOverlapSlot('2026-03-23', '14:30', [userA], 3),
      // 23:00 and 23:30 -- should be excluded (after 22:30)
      buildOverlapSlot('2026-03-23', '23:00', [userA], 3),
      buildOverlapSlot('2026-03-23', '23:30', [userA], 3),
    ];
    mockOverlaps(overlaps);
    mockGroupMembers([userA, userB, userC], { 'auth0|aaa': true, 'auth0|bbb': true, 'auth0|ccc': true });

    const result = await availabilityService.getGroupHeatmap('test-group-id', '2026-03-23', 'UTC');

    // No slot for hour 9
    const slot09 = result.slots.find(s => s.date === '2026-03-23' && s.hour === 9);
    expect(slot09).toBeUndefined();

    // No slot for hour 23
    const slot23 = result.slots.find(s => s.date === '2026-03-23' && s.hour === 23);
    expect(slot23).toBeUndefined();

    // Hour 14 should exist
    const slot14 = result.slots.find(s => s.date === '2026-03-23' && s.hour === 14);
    expect(slot14).toBeDefined();
    expect(slot14.availableCount).toBe(1);

    // Hour 10 should now exist (new lower boundary)
    const slot10 = result.slots.find(s => s.date === '2026-03-23' && s.hour === 10);
    expect(slot10).toBeDefined();
  });

  // ===================================
  // Test 4: membersWithoutData identifies members with no recurring schedule, gcal, or poll response
  // ===================================
  it('membersWithoutData lists members with no recurring schedule, gcal, or poll response', async () => {
    mockOverlaps([]);
    // 5 members: 3 have availability data, 2 do not
    mockGroupMembers(
      [
        { ...userA, google_calendar_enabled: false },
        { ...userB, google_calendar_enabled: true, google_calendar_token: 'token-b' },
        { ...userC, google_calendar_enabled: false },
        { user_id: 'auth0|ddd', username: 'Dave', email: 'dave@test.com', google_calendar_enabled: false },
        { user_id: 'auth0|eee', username: 'Eve', email: 'eve@test.com', google_calendar_enabled: false },
      ],
      {
        'auth0|aaa': true,   // has recurring schedule
        'auth0|bbb': false,  // has gcal (google_calendar_enabled=true)
        'auth0|ccc': true,   // has recurring schedule
        'auth0|ddd': false,  // no data
        'auth0|eee': false,  // no data
      }
    );

    const result = await availabilityService.getGroupHeatmap('test-group-id', '2026-03-23', 'UTC');

    expect(result.totalMembers).toBe(5);
    expect(result.membersWithoutData).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ user_id: 'auth0|ddd', username: 'Dave' }),
        expect.objectContaining({ user_id: 'auth0|eee', username: 'Eve' }),
      ])
    );
    expect(result.membersWithoutData).toHaveLength(2);
    expect(result.membersWithData).toBe(3);
  });

  // ===================================
  // Test 5: Returns exactly 91 slots (7 days x 13 hours: 10-22)
  // ===================================
  it('returns exactly 91 slots (7 days x 13 hours) for a full week', async () => {
    mockOverlaps([]);
    mockGroupMembers([userA], { 'auth0|aaa': true });

    const result = await availabilityService.getGroupHeatmap('test-group-id', '2026-03-23', 'UTC');

    expect(result.slots).toHaveLength(91);

    // Verify all hours are 10-22
    const hours = [...new Set(result.slots.map(s => s.hour))];
    expect(hours.sort((a, b) => a - b)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]);

    // Verify all 7 days present
    const dates = [...new Set(result.slots.map(s => s.date))];
    expect(dates).toHaveLength(7);
  });

  // ===================================
  // Test 6: dayOfWeek values are 1-7 (Mon-Sun ISO format)
  // ===================================
  it('dayOfWeek values are 1-7 (Mon-Sun ISO format) matching the date', async () => {
    mockOverlaps([]);
    mockGroupMembers([userA], { 'auth0|aaa': true });

    // 2026-03-23 is a Monday
    const result = await availabilityService.getGroupHeatmap('test-group-id', '2026-03-23', 'UTC');

    // March 23, 2026 is Monday
    const mondaySlots = result.slots.filter(s => s.date === '2026-03-23');
    expect(mondaySlots.length).toBeGreaterThan(0);
    mondaySlots.forEach(s => expect(s.dayOfWeek).toBe(1)); // Monday = 1

    // March 29, 2026 is Sunday
    const sundaySlots = result.slots.filter(s => s.date === '2026-03-29');
    expect(sundaySlots.length).toBeGreaterThan(0);
    sundaySlots.forEach(s => expect(s.dayOfWeek).toBe(7)); // Sunday = 7
  });

  // ===================================
  // Test 7: weekStart must be a Monday -- errors if not
  // ===================================
  it('throws error when weekStart is not a Monday', async () => {
    mockOverlaps([]);
    mockGroupMembers([userA], { 'auth0|aaa': true });

    // 2026-03-25 is a Wednesday
    await expect(
      availabilityService.getGroupHeatmap('test-group-id', '2026-03-25', 'UTC')
    ).rejects.toThrow(/monday/i);
  });

  // ===================================
  // Test 8: Response shape -- weekStart, weekEnd, totalMembers, gcalConflicts fields
  // ===================================
  it('returns correct response shape with weekStart, weekEnd, totalMembers, gcalConflicts', async () => {
    mockOverlaps([]);
    mockGroupMembers([userA, userB], { 'auth0|aaa': true, 'auth0|bbb': true });

    const result = await availabilityService.getGroupHeatmap('test-group-id', '2026-03-23', 'UTC');

    expect(result.weekStart).toBe('2026-03-23');
    expect(result.weekEnd).toBe('2026-03-30');
    expect(result.totalMembers).toBe(2);
    expect(result.membersWithData).toBe(2);
    expect(result.membersWithoutData).toEqual([]);
    expect(Array.isArray(result.slots)).toBe(true);
    expect(Array.isArray(result.gcalConflicts)).toBe(true);
    expect(result.gcalConflicts).toEqual([]);
  });

  // ===================================
  // Test 9: Each slot has correct shape
  // ===================================
  it('each slot has date, dayOfWeek, hour, availableCount, totalMembers, availableMembers', async () => {
    const overlaps = [
      buildOverlapSlot('2026-03-23', '14:00', [userA], 2),
      buildOverlapSlot('2026-03-23', '14:30', [userA], 2),
    ];
    mockOverlaps(overlaps);
    mockGroupMembers([userA, userB], { 'auth0|aaa': true, 'auth0|bbb': true });

    const result = await availabilityService.getGroupHeatmap('test-group-id', '2026-03-23', 'UTC');

    const slot = result.slots.find(s => s.date === '2026-03-23' && s.hour === 14);
    expect(slot).toMatchObject({
      date: '2026-03-23',
      dayOfWeek: 1,
      hour: 14,
      availableCount: 1,
      totalMembers: 2,
      availableMembers: [{ user_id: 'auth0|aaa', username: 'Alice' }],
    });
  });

  // ===================================
  // Test 10: Poll response overrides overlap data (poll says available)
  // ===================================
  it('poll response marks user as available even when overlap data says unavailable', async () => {
    // No overlap data for userA at 19:00-19:30 (gcal/recurring says busy)
    const overlaps = [];
    mockOverlaps(overlaps);
    mockGroupMembers([userA, userB], { 'auth0|aaa': true, 'auth0|bbb': true });

    // Mock an active prompt for this week
    AvailabilityPrompt.findAll.mockResolvedValue([{
      id: 'prompt-1',
      group_id: 'test-group-id',
      status: 'active',
      week_identifier: '2026-W13',
    }]);

    // User A responded with availability at 19:00-20:00 on Monday
    AvailabilityResponse.findAll.mockResolvedValue([{
      user_id: 'auth0|aaa',
      prompt_id: 'prompt-1',
      time_slots: [
        { start: '2026-03-23T19:00:00.000Z', end: '2026-03-23T19:30:00.000Z', preference: 'preferred' },
        { start: '2026-03-23T19:30:00.000Z', end: '2026-03-23T20:00:00.000Z', preference: 'preferred' },
      ],
      User: { user_id: 'auth0|aaa', username: 'Alice' },
    }]);

    const result = await availabilityService.getGroupHeatmap('test-group-id', '2026-03-23', 'UTC');

    const slot19 = result.slots.find(s => s.date === '2026-03-23' && s.hour === 19);
    expect(slot19).toBeDefined();
    expect(slot19.availableCount).toBe(1);
    expect(slot19.availableMembers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ user_id: 'auth0|aaa', username: 'Alice' })
      ])
    );
  });

  // ===================================
  // Test 11: Poll response removes user from available when poll says unavailable
  // ===================================
  it('poll response removes user from slot when poll has no data for that hour', async () => {
    // Overlap says userA is available at 14:00-14:30 (from recurring)
    const overlaps = [
      buildOverlapSlot('2026-03-23', '14:00', [userA], 2),
      buildOverlapSlot('2026-03-23', '14:30', [userA], 2),
    ];
    mockOverlaps(overlaps);
    mockGroupMembers([userA, userB], { 'auth0|aaa': true, 'auth0|bbb': true });

    // Mock active prompt
    AvailabilityPrompt.findAll.mockResolvedValue([{
      id: 'prompt-1',
      group_id: 'test-group-id',
      status: 'active',
      week_identifier: '2026-W13',
    }]);

    // User A responded but only for 19:00-20:00, not 14:00
    AvailabilityResponse.findAll.mockResolvedValue([{
      user_id: 'auth0|aaa',
      prompt_id: 'prompt-1',
      time_slots: [
        { start: '2026-03-23T19:00:00.000Z', end: '2026-03-23T19:30:00.000Z', preference: 'preferred' },
        { start: '2026-03-23T19:30:00.000Z', end: '2026-03-23T20:00:00.000Z', preference: 'preferred' },
      ],
      User: { user_id: 'auth0|aaa', username: 'Alice' },
    }]);

    const result = await availabilityService.getGroupHeatmap('test-group-id', '2026-03-23', 'UTC');

    // At 14:00, userA should be removed because poll takes priority and poll says unavailable at that hour
    const slot14 = result.slots.find(s => s.date === '2026-03-23' && s.hour === 14);
    expect(slot14).toBeDefined();
    expect(slot14.availableCount).toBe(0);
  });

  // ===================================
  // Test 12: gcalConflicts detected when poll says available but gcal says busy
  // ===================================
  it('detects gcal conflicts when poll says available but Google Calendar says busy', async () => {
    mockOverlaps([]);
    mockGroupMembers([
      { ...userA, google_calendar_enabled: true, google_calendar_token: 'token-a' },
      userB,
    ], { 'auth0|aaa': false, 'auth0|bbb': true });

    // Mock active prompt
    AvailabilityPrompt.findAll.mockResolvedValue([{
      id: 'prompt-1',
      group_id: 'test-group-id',
      status: 'active',
      week_identifier: '2026-W13',
    }]);

    // User A responded available at 19:00-20:00
    AvailabilityResponse.findAll.mockResolvedValue([{
      user_id: 'auth0|aaa',
      prompt_id: 'prompt-1',
      time_slots: [
        { start: '2026-03-23T19:00:00.000Z', end: '2026-03-23T19:30:00.000Z', preference: 'preferred' },
        { start: '2026-03-23T19:30:00.000Z', end: '2026-03-23T20:00:00.000Z', preference: 'preferred' },
      ],
      User: { user_id: 'auth0|aaa', username: 'Alice' },
    }]);

    // Gcal says busy at 19:00-19:30
    googleCalendarService.getBusyTimesForDateRange.mockResolvedValue([
      { date: '2026-03-23', startTime: '19:00', endTime: '19:30' },
    ]);

    const result = await availabilityService.getGroupHeatmap('test-group-id', '2026-03-23', 'UTC');

    // User A should still be available (poll takes priority)
    const slot19 = result.slots.find(s => s.date === '2026-03-23' && s.hour === 19);
    expect(slot19.availableCount).toBe(1);

    // But a gcal conflict should be recorded
    expect(result.gcalConflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          user_id: 'auth0|aaa',
          username: 'Alice',
          date: '2026-03-23',
          hour: 19,
        })
      ])
    );
  });
});
