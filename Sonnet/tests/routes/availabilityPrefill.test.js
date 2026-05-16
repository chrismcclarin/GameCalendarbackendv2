// tests/routes/availabilityPrefill.test.js
// Integration tests for POST /api/availability-prefill/gcal (CHKIN-05).
// Magic-token-authenticated; uses { consume: false }.

require('dotenv').config({ path: '.env.test' });
process.env.NODE_ENV = 'test';

if (!process.env.MAGIC_TOKEN_SECRET) {
  process.env.MAGIC_TOKEN_SECRET = 'test-secret-key-for-jwt-signing-minimum-32-chars-long';
}

const request = require('supertest');
const express = require('express');

// Stub googleCalendarService BEFORE the route requires it so we control the
// freebusy output without hitting the network.
jest.mock('../../services/googleCalendarService', () => ({
  getBusyTimesForDateRange: jest.fn(),
}));

const googleCalendarService = require('../../services/googleCalendarService');
const availabilityPrefillRoutes = require('../../routes/availabilityPrefill');
const {
  User,
  Group,
  AvailabilityPrompt,
  MagicToken,
  TokenAnalytics,
  sequelize,
} = require('../../models');
const { generateToken } = require('../../services/magicTokenService');

const app = express();
app.use(express.json());
app.use('/api/availability-prefill', availabilityPrefillRoutes);

describe('POST /api/availability-prefill/gcal', () => {
  let connectedUser;
  let disconnectedUser;
  let testGroup;
  let testPrompt;
  let connectedToken;

  beforeAll(async () => {
    await sequelize.sync({ force: true });

    connectedUser = await User.create({
      user_id: 'auth0|prefill-connected',
      username: 'GCal Connected',
      email: 'gcal-connected@test.com',
      google_calendar_enabled: true,
      google_calendar_token: 'fake-access-token',
      google_calendar_refresh_token: 'fake-refresh-token',
    });

    disconnectedUser = await User.create({
      user_id: 'auth0|prefill-disconnected',
      username: 'GCal Disconnected',
      email: 'gcal-disconnected@test.com',
      google_calendar_enabled: false,
      google_calendar_token: null,
    });

    testGroup = await Group.create({
      name: 'Prefill Test Group',
      group_id: 'prefill-group-001',
    });

    testPrompt = await AvailabilityPrompt.create({
      group_id: testGroup.id,
      prompt_date: new Date(),
      deadline: new Date(Date.now() + 72 * 60 * 60 * 1000),
      status: 'active',
      week_identifier: '2026-W21-prefill',
    });

    connectedToken = await generateToken(connectedUser, testPrompt);
  });

  afterAll(async () => {
    await sequelize.close();
  });

  beforeEach(async () => {
    googleCalendarService.getBusyTimesForDateRange.mockReset();
    googleCalendarService.getBusyTimesForDateRange.mockResolvedValue([]);
    await TokenAnalytics.destroy({ where: {} });
  });

  // ------------------------------------------------------------------
  // Input validation
  // ------------------------------------------------------------------

  it('returns 400 when magic_token is missing', async () => {
    const res = await request(app)
      .post('/api/availability-prefill/gcal')
      .send({ start_date: '2026-05-18', num_days: 7, timezone: 'America/Los_Angeles' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/magic_token/);
  });

  it('returns 400 when start_date format is invalid', async () => {
    const res = await request(app)
      .post('/api/availability-prefill/gcal')
      .send({
        magic_token: connectedToken,
        start_date: '05/18/2026',
        num_days: 7,
        timezone: 'America/Los_Angeles',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/YYYY-MM-DD/);
  });

  it('returns 400 when num_days > 14', async () => {
    const res = await request(app)
      .post('/api/availability-prefill/gcal')
      .send({
        magic_token: connectedToken,
        start_date: '2026-05-18',
        num_days: 30,
        timezone: 'America/Los_Angeles',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/num_days/);
  });

  it('returns 400 when num_days < 1', async () => {
    const res = await request(app)
      .post('/api/availability-prefill/gcal')
      .send({
        magic_token: connectedToken,
        start_date: '2026-05-18',
        num_days: 0,
        timezone: 'America/Los_Angeles',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/num_days/);
  });

  it('returns 400 when timezone is invalid', async () => {
    const res = await request(app)
      .post('/api/availability-prefill/gcal')
      .send({
        magic_token: connectedToken,
        start_date: '2026-05-18',
        num_days: 7,
        timezone: 'Not/A_Real_Timezone',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/timezone/);
  });

  // ------------------------------------------------------------------
  // GCal-not-connected branch
  // ------------------------------------------------------------------

  it('returns 400 when the magic-token user has GCal disconnected', async () => {
    const disconnectedJwt = await generateToken(disconnectedUser, testPrompt);
    const res = await request(app)
      .post('/api/availability-prefill/gcal')
      .send({
        magic_token: disconnectedJwt,
        start_date: '2026-05-18',
        num_days: 7,
        timezone: 'America/Los_Angeles',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Google Calendar is not connected/);
  });

  // ------------------------------------------------------------------
  // Happy path + slot-ID shape
  // ------------------------------------------------------------------

  it('returns slot_ids as ISO UTC strings matching grid generateSlotId format', async () => {
    // No busy slots — every generated slot is free.
    googleCalendarService.getBusyTimesForDateRange.mockResolvedValue([]);

    const res = await request(app)
      .post('/api/availability-prefill/gcal')
      .send({
        magic_token: connectedToken,
        start_date: '2026-05-18',
        num_days: 7,
        timezone: 'America/Los_Angeles',
      });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.slot_ids)).toBe(true);
    expect(res.body.count).toBe(res.body.slot_ids.length);
    expect(res.body.count).toBeGreaterThan(0);

    // Every slot ID must be an ISO 8601 UTC string with the .000Z suffix
    // (matches AvailabilityGrid.generateSlotId output).
    for (const id of res.body.slot_ids) {
      expect(id).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/);
    }
  });

  it('excludes slots whose UTC date+startTime is in the busy set (conservative overlap)', async () => {
    // Mark 02:00 UTC on the start day as busy. The endpoint must not include
    // a "2026-05-18T02:00:00.000Z" slot in the free list, but should include
    // "2026-05-18T02:30:00.000Z" (adjacent slot is free).
    googleCalendarService.getBusyTimesForDateRange.mockResolvedValue([
      { date: '2026-05-18', startTime: '02:00', endTime: '02:30' },
    ]);

    const res = await request(app)
      .post('/api/availability-prefill/gcal')
      .send({
        magic_token: connectedToken,
        start_date: '2026-05-18',
        num_days: 7,
        timezone: 'America/Los_Angeles',
      });

    expect(res.status).toBe(200);
    expect(res.body.slot_ids).not.toContain('2026-05-18T02:00:00.000Z');
    expect(res.body.slot_ids).toContain('2026-05-18T02:30:00.000Z');
  });

  // ------------------------------------------------------------------
  // { consume: false } assertion (Pitfall 6)
  // ------------------------------------------------------------------

  it('passes { consume: false } when validating the magic token (source-level assertion)', () => {
    // Source-level assertion: the route file must import validateToken with
    // `{ consume: false }`. We can't reliably jest.spyOn the function reference
    // after the route has destructured it at require-time, so we assert the
    // source string directly — this is the cheapest, most stable signal that
    // Pitfall 6 is mitigated.
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.join(__dirname, '..', '..', 'routes', 'availabilityPrefill.js'),
      'utf8'
    );
    expect(source).toMatch(/validateToken\s*\([^)]*\{\s*consume:\s*false\s*\}\s*\)/);
  });

  it('can be called twice in a row without invalidating the token (consume:false in action)', async () => {
    googleCalendarService.getBusyTimesForDateRange.mockResolvedValue([]);

    const first = await request(app)
      .post('/api/availability-prefill/gcal')
      .send({
        magic_token: connectedToken,
        start_date: '2026-05-18',
        num_days: 7,
        timezone: 'America/Los_Angeles',
      });
    const second = await request(app)
      .post('/api/availability-prefill/gcal')
      .send({
        magic_token: connectedToken,
        start_date: '2026-05-18',
        num_days: 7,
        timezone: 'America/Los_Angeles',
      });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });

  // ------------------------------------------------------------------
  // Empty / all-busy case
  // ------------------------------------------------------------------

  it('returns an empty array (count: 0) when every slot is busy', async () => {
    // Use generateTimeSlots to derive what the endpoint will see, then mark
    // every slot as busy.
    const availabilityService = require('../../services/availabilityService');
    const startDate = new Date('2026-05-18T00:00:00.000Z');
    const endDate = new Date('2026-05-19T00:00:00.000Z'); // 1 day only
    const allSlots = availabilityService.generateTimeSlots(startDate, endDate, 'America/Los_Angeles');
    googleCalendarService.getBusyTimesForDateRange.mockResolvedValue(
      allSlots.map(s => ({ date: s.date, startTime: s.startTime, endTime: s.endTime }))
    );

    const res = await request(app)
      .post('/api/availability-prefill/gcal')
      .send({
        magic_token: connectedToken,
        start_date: '2026-05-18',
        num_days: 1,
        timezone: 'America/Los_Angeles',
      });

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
    expect(res.body.slot_ids).toEqual([]);
  });
});
