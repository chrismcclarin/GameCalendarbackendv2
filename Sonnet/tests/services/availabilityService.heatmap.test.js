// tests/services/availabilityService.heatmap.test.js
// Unit tests for getGroupHeatmap -- 30-min to 1-hour bucketing and heatmap normalization

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
  return {
    Group: mockGroup,
    UserGroup: mockUserGroup,
    UserAvailability: mockUserAvailability,
    User: mockUser,
  };
});

jest.mock('../../services/googleCalendarService', () => ({
  getBusyTimesForDateRange: jest.fn().mockResolvedValue([]),
}));

const availabilityService = require('../../services/availabilityService');
const { Group, UserAvailability } = require('../../models');

describe('availabilityService.getGroupHeatmap', () => {

  beforeEach(() => {
    jest.clearAllMocks();
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
  // Test 3: Slots outside 12pm-11pm are excluded
  // ===================================
  it('excludes slots outside 12pm-10pm range (11:00 and 23:00 excluded)', async () => {
    const overlaps = [
      // 11:00 and 11:30 -- should be excluded (before 12pm)
      buildOverlapSlot('2026-03-23', '11:00', [userA], 3),
      buildOverlapSlot('2026-03-23', '11:30', [userA], 3),
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

    // No slot for hour 11
    const slot11 = result.slots.find(s => s.date === '2026-03-23' && s.hour === 11);
    expect(slot11).toBeUndefined();

    // No slot for hour 23
    const slot23 = result.slots.find(s => s.date === '2026-03-23' && s.hour === 23);
    expect(slot23).toBeUndefined();

    // Hour 14 should exist
    const slot14 = result.slots.find(s => s.date === '2026-03-23' && s.hour === 14);
    expect(slot14).toBeDefined();
    expect(slot14.availableCount).toBe(1);
  });

  // ===================================
  // Test 4: membersWithoutData identifies members with no recurring schedule or gcal
  // ===================================
  it('membersWithoutData lists members with no recurring schedule or gcal', async () => {
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
  // Test 5: Returns exactly 77 slots (7 days x 11 hours)
  // ===================================
  it('returns exactly 77 slots (7 days x 11 hours) for a full week', async () => {
    mockOverlaps([]);
    mockGroupMembers([userA], { 'auth0|aaa': true });

    const result = await availabilityService.getGroupHeatmap('test-group-id', '2026-03-23', 'UTC');

    expect(result.slots).toHaveLength(77);

    // Verify all hours are 12-22
    const hours = [...new Set(result.slots.map(s => s.hour))];
    expect(hours.sort((a, b) => a - b)).toEqual([12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]);

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
  // Test 8: Response shape -- weekStart, weekEnd, totalMembers fields
  // ===================================
  it('returns correct response shape with weekStart, weekEnd, totalMembers', async () => {
    mockOverlaps([]);
    mockGroupMembers([userA, userB], { 'auth0|aaa': true, 'auth0|bbb': true });

    const result = await availabilityService.getGroupHeatmap('test-group-id', '2026-03-23', 'UTC');

    expect(result.weekStart).toBe('2026-03-23');
    expect(result.weekEnd).toBe('2026-03-30');
    expect(result.totalMembers).toBe(2);
    expect(result.membersWithData).toBe(2);
    expect(result.membersWithoutData).toEqual([]);
    expect(Array.isArray(result.slots)).toBe(true);
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
});
