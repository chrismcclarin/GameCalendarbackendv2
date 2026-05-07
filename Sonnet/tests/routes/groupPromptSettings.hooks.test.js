// tests/routes/groupPromptSettings.hooks.test.js
// Verifies the on-write BullMQ hooks fire from each mutation route.
// Mocks the scheduler module + models so this test does not require Redis,
// Postgres, or the integration-test fixture chain.

// --- mock the scheduler module so we can assert it was called ---
const mockUpsertSingle = jest.fn();
const mockRemove = jest.fn();
jest.mock('../../schedulers/promptScheduler', () => ({
  upsertSinglePromptScheduler: mockUpsertSingle,
  removePromptScheduler: mockRemove
}));

// --- mock authorization (always allow) ---
jest.mock('../../services/authorizationService', () => ({
  isOwnerOrAdmin: jest.fn().mockResolvedValue(true),
  isActiveMember: jest.fn().mockResolvedValue(true)
}));

// --- mock models. Each test sets findOne/findByPk return values per case. ---
const mockGroupFindByPk = jest.fn();
const mockSettingsFindOne = jest.fn();
const mockSettingsCreate = jest.fn();
const mockSettingsUpdate = jest.fn();
const mockGameFindByPk = jest.fn();
const mockGameFindAll = jest.fn();
const mockUserGroupFindAll = jest.fn();

jest.mock('../../models', () => ({
  Group: { findByPk: (...a) => mockGroupFindByPk(...a) },
  User: {},
  UserGroup: { findAll: (...a) => mockUserGroupFindAll(...a) },
  GroupPromptSettings: {
    findOne: (...a) => mockSettingsFindOne(...a),
    create: (...a) => mockSettingsCreate(...a)
  },
  Game: {
    findByPk: (...a) => mockGameFindByPk(...a),
    findAll: (...a) => mockGameFindAll(...a)
  },
  Event: {} // referenced inside the GET route, never invoked here
}));

const express = require('express');
const request = require('supertest');
const groupPromptSettingsRouter = require('../../routes/groupPromptSettings');

function makeApp() {
  const app = express();
  app.use(express.json());
  // The route file is mounted under /api/groups in the real server; replicate.
  app.use('/api/groups', (req, _res, next) => {
    req.user = { user_id: 'auth0|test-user' };
    next();
  }, groupPromptSettingsRouter);
  return app;
}

describe('groupPromptSettings on-write BullMQ hooks', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUpsertSingle.mockResolvedValue({ schedulerId: 'prompt-schedule-x', cronPattern: '0 0 18 * * 3' });
    mockRemove.mockResolvedValue(true);

    mockGroupFindByPk.mockResolvedValue({ id: 'group-1', name: 'Test Group' });
    app = makeApp();
  });

  describe('POST /:group_id/prompt-settings/schedules', () => {
    test('fires upsertSinglePromptScheduler after creating schedule', async () => {
      const settingsRow = {
        id: 'settings-1',
        group_id: 'group-1',
        is_active: true,
        schedule_timezone: 'America/Los_Angeles',
        template_config: { schedules: [] },
        update: mockSettingsUpdate
      };
      mockSettingsFindOne.mockResolvedValue(settingsRow);
      mockSettingsUpdate.mockResolvedValue(settingsRow);

      const res = await request(app)
        .post('/api/groups/group-1/prompt-settings/schedules')
        .send({
          schedule_day_of_week: 3,
          schedule_time: '11:54',
          schedule_timezone: 'America/Los_Angeles',
          game_id: null,
          template_name: 'Wed test'
        });

      expect(res.status).toBe(201);
      expect(mockUpsertSingle).toHaveBeenCalledTimes(1);
      const [calledSettings, calledSchedule] = mockUpsertSingle.mock.calls[0];
      expect(calledSettings).toBe(settingsRow);
      expect(calledSchedule).toMatchObject({
        schedule_day_of_week: 3,
        schedule_time: '11:54',
        is_active: true
      });
      expect(calledSchedule.id).toBeDefined();
    });

    test('does NOT fire upsert when group settings is_active=false', async () => {
      const settingsRow = {
        id: 'settings-1',
        group_id: 'group-1',
        is_active: false, // group has paused prompts entirely
        schedule_timezone: 'America/Los_Angeles',
        template_config: { schedules: [] },
        update: mockSettingsUpdate
      };
      mockSettingsFindOne.mockResolvedValue(settingsRow);
      mockSettingsUpdate.mockResolvedValue(settingsRow);

      await request(app)
        .post('/api/groups/group-1/prompt-settings/schedules')
        .send({
          schedule_day_of_week: 3,
          schedule_time: '11:54',
          schedule_timezone: 'America/Los_Angeles'
        });

      expect(mockUpsertSingle).not.toHaveBeenCalled();
    });

    test('hook failure does not break the HTTP response', async () => {
      const settingsRow = {
        id: 'settings-1',
        group_id: 'group-1',
        is_active: true,
        schedule_timezone: 'America/Los_Angeles',
        template_config: { schedules: [] },
        update: mockSettingsUpdate
      };
      mockSettingsFindOne.mockResolvedValue(settingsRow);
      mockSettingsUpdate.mockResolvedValue(settingsRow);
      mockUpsertSingle.mockRejectedValue(new Error('redis down'));

      const res = await request(app)
        .post('/api/groups/group-1/prompt-settings/schedules')
        .send({
          schedule_day_of_week: 3,
          schedule_time: '11:54',
          schedule_timezone: 'America/Los_Angeles'
        });

      expect(res.status).toBe(201); // route still succeeded
      expect(mockUpsertSingle).toHaveBeenCalled();
    });
  });

  describe('PATCH /:group_id/prompt-settings/schedules/:schedule_id', () => {
    test('upserts when schedule remains active after update', async () => {
      const existingSchedule = {
        id: 'sched-1',
        is_active: true,
        schedule_day_of_week: 3,
        schedule_time: '11:54',
        schedule_timezone: 'America/Los_Angeles',
        game_id: null,
        selected_member_ids: []
      };
      const settingsRow = {
        id: 'settings-1',
        group_id: 'group-1',
        is_active: true,
        schedule_timezone: 'America/Los_Angeles',
        template_config: { schedules: [existingSchedule] },
        update: mockSettingsUpdate
      };
      mockSettingsFindOne.mockResolvedValue(settingsRow);
      mockSettingsUpdate.mockResolvedValue(settingsRow);

      const res = await request(app)
        .patch('/api/groups/group-1/prompt-settings/schedules/sched-1')
        .send({ schedule_time: '12:00' });

      expect(res.status).toBe(200);
      expect(mockUpsertSingle).toHaveBeenCalledTimes(1);
      const [, calledSchedule] = mockUpsertSingle.mock.calls[0];
      expect(calledSchedule.schedule_time).toBe('12:00');
      expect(mockRemove).not.toHaveBeenCalled();
    });

    test('removes when update sets is_active=false', async () => {
      const existingSchedule = {
        id: 'sched-1',
        is_active: true,
        schedule_day_of_week: 3,
        schedule_time: '11:54'
      };
      const settingsRow = {
        id: 'settings-1',
        group_id: 'group-1',
        is_active: true,
        template_config: { schedules: [existingSchedule] },
        update: mockSettingsUpdate
      };
      mockSettingsFindOne.mockResolvedValue(settingsRow);
      mockSettingsUpdate.mockResolvedValue(settingsRow);

      await request(app)
        .patch('/api/groups/group-1/prompt-settings/schedules/sched-1')
        .send({ is_active: false });

      expect(mockRemove).toHaveBeenCalledWith('settings-1', 'sched-1');
      expect(mockUpsertSingle).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /:group_id/prompt-settings/schedules/:schedule_id', () => {
    test('always removes from BullMQ on delete', async () => {
      const settingsRow = {
        id: 'settings-1',
        group_id: 'group-1',
        is_active: true,
        template_config: {
          schedules: [{ id: 'sched-1', is_active: true, schedule_day_of_week: 3, schedule_time: '11:54' }]
        },
        update: mockSettingsUpdate
      };
      mockSettingsFindOne.mockResolvedValue(settingsRow);
      mockSettingsUpdate.mockResolvedValue(settingsRow);

      await request(app)
        .delete('/api/groups/group-1/prompt-settings/schedules/sched-1');

      expect(mockRemove).toHaveBeenCalledWith('settings-1', 'sched-1');
      expect(mockUpsertSingle).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /:group_id/prompt-settings/schedules/:schedule_id/toggle', () => {
    test('upserts when toggling from paused -> active', async () => {
      const settingsRow = {
        id: 'settings-1',
        group_id: 'group-1',
        is_active: true,
        template_config: {
          schedules: [{ id: 'sched-1', is_active: false, schedule_day_of_week: 3, schedule_time: '11:54' }]
        },
        update: mockSettingsUpdate
      };
      mockSettingsFindOne.mockResolvedValue(settingsRow);
      mockSettingsUpdate.mockResolvedValue(settingsRow);

      await request(app)
        .patch('/api/groups/group-1/prompt-settings/schedules/sched-1/toggle');

      expect(mockUpsertSingle).toHaveBeenCalledTimes(1);
      const [, calledSchedule] = mockUpsertSingle.mock.calls[0];
      expect(calledSchedule.is_active).toBe(true);
      expect(mockRemove).not.toHaveBeenCalled();
    });

    test('removes when toggling from active -> paused', async () => {
      const settingsRow = {
        id: 'settings-1',
        group_id: 'group-1',
        is_active: true,
        template_config: {
          schedules: [{ id: 'sched-1', is_active: true, schedule_day_of_week: 3, schedule_time: '11:54' }]
        },
        update: mockSettingsUpdate
      };
      mockSettingsFindOne.mockResolvedValue(settingsRow);
      mockSettingsUpdate.mockResolvedValue(settingsRow);

      await request(app)
        .patch('/api/groups/group-1/prompt-settings/schedules/sched-1/toggle');

      expect(mockRemove).toHaveBeenCalledWith('settings-1', 'sched-1');
      expect(mockUpsertSingle).not.toHaveBeenCalled();
    });
  });
});
