// tests/schedulers/promptScheduler.test.js
// Unit tests for promptScheduler — the post-refactor sync that reads from
// GroupPromptSettings.template_config.schedules[] (NOT the legacy top-level
// columns). Mocks the BullMQ queue + GroupPromptSettings model so no Redis
// or Postgres is required; this file does NOT inherit the integration-test
// fixture chain.

// --- mock the queue BEFORE requiring the scheduler ---
const mockUpsertJobScheduler = jest.fn();
const mockRemoveJobScheduler = jest.fn();
const mockGetJobSchedulers = jest.fn();

jest.mock('../../queues', () => ({
  promptQueue: {
    upsertJobScheduler: mockUpsertJobScheduler,
    removeJobScheduler: mockRemoveJobScheduler,
    getJobSchedulers: mockGetJobSchedulers
  }
}));

const mockSettingsFindAll = jest.fn();
jest.mock('../../models', () => ({
  GroupPromptSettings: { findAll: mockSettingsFindAll },
  SchedulerRun: { create: jest.fn().mockResolvedValue({}) }
}));

const {
  syncPromptSchedulesToQueue,
  upsertSinglePromptScheduler,
  removePromptScheduler,
  buildCronPattern,
  buildSchedulerId
} = require('../../schedulers/promptScheduler');

describe('promptScheduler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpsertJobScheduler.mockResolvedValue({});
    mockRemoveJobScheduler.mockResolvedValue(true);
    mockGetJobSchedulers.mockResolvedValue([]);
  });

  describe('buildCronPattern', () => {
    test('builds 6-field cron from HH:MM time', () => {
      expect(buildCronPattern(3, '11:54')).toBe('0 54 11 * * 3');
    });

    test('builds 6-field cron from HH:MM:SS time (legacy format)', () => {
      expect(buildCronPattern(0, '08:30:00')).toBe('0 30 8 * * 0');
    });

    test('returns null for missing day', () => {
      expect(buildCronPattern(null, '10:00')).toBeNull();
      expect(buildCronPattern(undefined, '10:00')).toBeNull();
    });

    test('returns null for missing time', () => {
      expect(buildCronPattern(2, null)).toBeNull();
      expect(buildCronPattern(2, '')).toBeNull();
    });

    test('returns null for malformed time', () => {
      expect(buildCronPattern(2, 'noon')).toBeNull();
      expect(buildCronPattern(2, '25:00')).toBeNull();
      expect(buildCronPattern(2, '10:99')).toBeNull();
    });
  });

  describe('buildSchedulerId', () => {
    test('composes settings + schedule into a stable id', () => {
      expect(buildSchedulerId('settings-uuid', 'schedule-uuid'))
        .toBe('prompt-schedule-settings-uuid-schedule-uuid');
    });
  });

  describe('syncPromptSchedulesToQueue', () => {
    function makeSettings({ id = 'settings-1', group_id = 'group-1', is_active = true, schedules = [] } = {}) {
      return {
        id,
        group_id,
        is_active,
        schedule_timezone: 'America/Los_Angeles',
        default_deadline_hours: 72,
        default_token_expiry_hours: 168,
        min_participants: null,
        template_config: { schedules }
      };
    }

    function makeSchedule(overrides = {}) {
      return {
        id: 'sched-active-1',
        is_active: true,
        schedule_day_of_week: 3,    // Wednesday
        schedule_time: '11:54',
        schedule_timezone: 'America/Los_Angeles',
        game_id: 'game-1',
        default_deadline_hours: 48,
        default_token_expiry_hours: 96,
        min_participants: 4,
        selected_member_ids: ['auth0|alice', 'auth0|bob'],
        template_name: 'Wed Catan',
        ...overrides
      };
    }

    test('syncs only the active, non-deleted nested schedule (1 of 3)', async () => {
      const settings = makeSettings({
        schedules: [
          makeSchedule({ id: 'sched-active-1' }),
          makeSchedule({ id: 'sched-deleted', deleted_at: '2026-04-01T00:00:00Z' }),
          makeSchedule({ id: 'sched-paused', is_active: false })
        ]
      });
      mockSettingsFindAll.mockResolvedValue([settings]);

      const result = await syncPromptSchedulesToQueue();

      expect(result.synced).toBe(1);
      expect(result.skipped).toBe(2);
      expect(mockUpsertJobScheduler).toHaveBeenCalledTimes(1);

      const [schedulerId, repeatOpts, jobTemplate] = mockUpsertJobScheduler.mock.calls[0];
      expect(schedulerId).toBe('prompt-schedule-settings-1-sched-active-1');
      expect(repeatOpts).toEqual({
        pattern: '0 54 11 * * 3',
        tz: 'America/Los_Angeles'
      });
      expect(jobTemplate.name).toBe('send-availability-prompt');
      expect(jobTemplate.data).toMatchObject({
        groupId: 'group-1',
        settingsId: 'settings-1',
        scheduleId: 'sched-active-1',
        timezone: 'America/Los_Angeles',
        gameId: 'game-1',
        defaultDeadlineHours: 48,
        defaultTokenExpiryHours: 96,
        minParticipants: 4,
        selectedMemberIds: ['auth0|alice', 'auth0|bob']
      });
    });

    test('skips entire group when top-level is_active is false', async () => {
      const settings = makeSettings({
        is_active: false,
        schedules: [makeSchedule(), makeSchedule({ id: 'sched-2' })]
      });
      mockSettingsFindAll.mockResolvedValue([settings]);

      const result = await syncPromptSchedulesToQueue();

      expect(result.synced).toBe(0);
      expect(result.skipped).toBe(2); // both nested schedules counted as skipped
      expect(mockUpsertJobScheduler).not.toHaveBeenCalled();
    });

    test('handles multiple settings rows, multiple schedules each', async () => {
      mockSettingsFindAll.mockResolvedValue([
        makeSettings({
          id: 'settings-A',
          group_id: 'group-A',
          schedules: [
            makeSchedule({ id: 's-A1' }),
            makeSchedule({ id: 's-A2', schedule_day_of_week: 6, schedule_time: '20:00' })
          ]
        }),
        makeSettings({
          id: 'settings-B',
          group_id: 'group-B',
          schedules: [makeSchedule({ id: 's-B1', schedule_day_of_week: 1, schedule_time: '09:30' })]
        })
      ]);

      const result = await syncPromptSchedulesToQueue();

      expect(result.synced).toBe(3);
      expect(result.skipped).toBe(0);
      expect(mockUpsertJobScheduler).toHaveBeenCalledTimes(3);
    });

    test('reconciles by removing orphan BullMQ schedulers in our namespace', async () => {
      mockSettingsFindAll.mockResolvedValue([
        makeSettings({ schedules: [makeSchedule({ id: 'sched-active-1' })] })
      ]);
      mockGetJobSchedulers.mockResolvedValue([
        { key: 'prompt-schedule-settings-1-sched-active-1' }, // live, keep
        { key: 'prompt-schedule-settings-1-sched-orphan' },   // orphan, remove
        { key: 'prompt-schedule-old-settings-old-sched' },     // orphan, remove
        { key: 'reminder-schedule-other-namespace' }           // foreign ns, leave
      ]);

      const result = await syncPromptSchedulesToQueue();

      expect(result.reconciled).toBe(2);
      expect(mockRemoveJobScheduler).toHaveBeenCalledWith('prompt-schedule-settings-1-sched-orphan');
      expect(mockRemoveJobScheduler).toHaveBeenCalledWith('prompt-schedule-old-settings-old-sched');
      expect(mockRemoveJobScheduler).not.toHaveBeenCalledWith('reminder-schedule-other-namespace');
      expect(mockRemoveJobScheduler).not.toHaveBeenCalledWith('prompt-schedule-settings-1-sched-active-1');
    });

    test('reconcile failure does not break the sync', async () => {
      mockSettingsFindAll.mockResolvedValue([
        makeSettings({ schedules: [makeSchedule()] })
      ]);
      mockGetJobSchedulers.mockRejectedValue(new Error('redis down'));

      const result = await syncPromptSchedulesToQueue();

      expect(result.synced).toBe(1);
      // reconciled defaults to 0 when sweep fails
      expect(result.reconciled).toBe(0);
    });

    test('upsert failure on one schedule does not abort the others', async () => {
      mockSettingsFindAll.mockResolvedValue([
        makeSettings({
          schedules: [
            makeSchedule({ id: 's-1' }),
            makeSchedule({ id: 's-2' }),
            makeSchedule({ id: 's-3' })
          ]
        })
      ]);
      mockUpsertJobScheduler
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('upsert blew up'))
        .mockResolvedValueOnce({});

      const result = await syncPromptSchedulesToQueue();

      expect(result.synced).toBe(2);
      expect(result.skipped).toBe(1);
    });

    test('skips schedules with missing day or time', async () => {
      mockSettingsFindAll.mockResolvedValue([
        makeSettings({
          schedules: [
            makeSchedule({ id: 's-no-day', schedule_day_of_week: null }),
            makeSchedule({ id: 's-no-time', schedule_time: null })
          ]
        })
      ]);

      const result = await syncPromptSchedulesToQueue();

      expect(result.synced).toBe(0);
      expect(result.skipped).toBe(2);
      expect(mockUpsertJobScheduler).not.toHaveBeenCalled();
    });
  });

  describe('upsertSinglePromptScheduler', () => {
    test('upserts a single schedule with the right composite ID and tz fallback', async () => {
      const settings = {
        id: 'set-1',
        group_id: 'grp-1',
        schedule_timezone: 'America/New_York', // fallback tz
        default_deadline_hours: 72,
        default_token_expiry_hours: 168
      };
      const schedule = {
        id: 'sched-x',
        schedule_day_of_week: 5,
        schedule_time: '18:00',
        // schedule_timezone omitted → falls back to settings tz
        game_id: null,
        selected_member_ids: []
      };

      const result = await upsertSinglePromptScheduler(settings, schedule);

      expect(result).toEqual({
        schedulerId: 'prompt-schedule-set-1-sched-x',
        cronPattern: '0 0 18 * * 5'
      });
      expect(mockUpsertJobScheduler).toHaveBeenCalledTimes(1);
      const [, repeatOpts] = mockUpsertJobScheduler.mock.calls[0];
      expect(repeatOpts.tz).toBe('America/New_York');
    });

    test('returns null if cron pattern can not be built', async () => {
      const settings = { id: 'set-1', group_id: 'grp-1' };
      const schedule = { id: 'sched-x', schedule_day_of_week: null };

      const result = await upsertSinglePromptScheduler(settings, schedule);

      expect(result).toBeNull();
      expect(mockUpsertJobScheduler).not.toHaveBeenCalled();
    });
  });

  describe('removePromptScheduler', () => {
    test('removes by composite ID', async () => {
      const ok = await removePromptScheduler('set-1', 'sched-x');

      expect(ok).toBe(true);
      expect(mockRemoveJobScheduler).toHaveBeenCalledWith('prompt-schedule-set-1-sched-x');
    });

    test('returns false on missing args (no-op)', async () => {
      const ok = await removePromptScheduler('set-1', null);
      expect(ok).toBe(false);
      expect(mockRemoveJobScheduler).not.toHaveBeenCalled();
    });

    test('treats "not found" errors as benign', async () => {
      mockRemoveJobScheduler.mockRejectedValue(new Error('Job scheduler not found'));
      const ok = await removePromptScheduler('set-1', 'sched-x');
      expect(ok).toBe(false);
    });

    test('rethrows real errors', async () => {
      mockRemoveJobScheduler.mockRejectedValue(new Error('redis down'));
      await expect(removePromptScheduler('set-1', 'sched-x')).rejects.toThrow('redis down');
    });
  });
});
