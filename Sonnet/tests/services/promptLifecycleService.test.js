// tests/services/promptLifecycleService.test.js
// Phase 71.2 / Plan 02 — unit tests for the prompt lifecycle service.
//
// These tests mock all model imports + emailService so they run without the
// test DB. They exercise the consensus check, the close-notification dispatch,
// and the LOCKED recipient resolution rule (D-ADAPT-05 + D-SCHEMA-06).

// Mock models module before requiring the service.
jest.mock('../../models', () => ({
  AvailabilityPrompt: { findByPk: jest.fn() },
  AvailabilityResponse: { count: jest.fn(), findAll: jest.fn() },
  AvailabilitySuggestion: { findAll: jest.fn() },
  UserGroup: { count: jest.fn(), findOne: jest.fn() },
  Group: { findByPk: jest.fn() },
  GroupPromptSettings: { findByPk: jest.fn() },
  User: { findByPk: jest.fn(), findOne: jest.fn() },
  Game: { findByPk: jest.fn() },
}));

jest.mock('../../services/emailService', () => ({
  send: jest.fn(),
  generatePollClosedEmailTemplate: jest.fn(() => ({
    html: '<stub>',
    text: 'stub',
    subject: 'stub-subject',
  })),
}));

const lifecycleService = require('../../services/promptLifecycleService');
const models = require('../../models');
const emailService = require('../../services/emailService');

const {
  AvailabilityPrompt,
  AvailabilityResponse,
  AvailabilitySuggestion,
  UserGroup,
  Group,
  GroupPromptSettings,
  User,
  Game,
} = models;

// Helper — produce a Sequelize-instance-like prompt mock.
function makePromptMock(overrides = {}) {
  const data = {
    id: 'prompt-uuid-1',
    group_id: 'group-uuid-1',
    game_id: null,
    status: 'active',
    deadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
    created_by_user_id: null,
    created_by_settings_id: null,
    ...overrides,
  };
  data.update = jest.fn(async (patch) => {
    Object.assign(data, patch);
    return data;
  });
  data.reload = jest.fn(async () => data);
  return data;
}

beforeEach(() => {
  jest.clearAllMocks();
  // Sensible defaults — most tests override per-case.
  AvailabilitySuggestion.findAll.mockResolvedValue([]);
  AvailabilityResponse.count.mockResolvedValue(0);
  AvailabilityResponse.findAll.mockResolvedValue([]);
  UserGroup.count.mockResolvedValue(0);
  Group.findByPk.mockResolvedValue({ id: 'group-uuid-1', name: 'Test Group' });
  Game.findByPk.mockResolvedValue(null);
});

describe('promptLifecycleService.checkConsensusAndClose', () => {
  it('Test 1: returns closed=false when not all members have responded', async () => {
    const prompt = makePromptMock();
    AvailabilityPrompt.findByPk.mockResolvedValue(prompt);
    UserGroup.count.mockResolvedValue(3);
    AvailabilityResponse.count.mockResolvedValue(2);

    const result = await lifecycleService.checkConsensusAndClose('prompt-uuid-1');

    expect(result.closed).toBe(false);
    expect(result.respondedCount).toBe(2);
    expect(result.totalActive).toBe(3);
    expect(prompt.update).not.toHaveBeenCalled();
    expect(emailService.send).not.toHaveBeenCalled();
  });

  it('Test 2: returns closed=true and dispatches close-notification when all members respond', async () => {
    const prompt = makePromptMock({
      created_by_user_id: 'user-uuid-creator',
    });
    AvailabilityPrompt.findByPk.mockResolvedValue(prompt);
    UserGroup.count.mockResolvedValue(3);
    AvailabilityResponse.count.mockResolvedValue(3);
    User.findByPk.mockResolvedValue({
      id: 'user-uuid-creator',
      email: 'creator@test.com',
      username: 'Creator',
      timezone: 'America/New_York',
      email_notifications_enabled: true,
    });
    AvailabilitySuggestion.findAll.mockResolvedValue([
      { id: 's1', score: 4, suggested_start: new Date('2026-05-10T18:00:00Z'), suggested_end: new Date('2026-05-10T21:00:00Z'), meets_minimum: true },
    ]);
    emailService.send.mockResolvedValue({ success: true });

    const result = await lifecycleService.checkConsensusAndClose('prompt-uuid-1');

    expect(result.closed).toBe(true);
    expect(prompt.update).toHaveBeenCalledWith({ status: 'closed' });
    expect(prompt.status).toBe('closed');
    expect(emailService.send).toHaveBeenCalledTimes(1);
  });

  it('Test 3: returns closed=false reason=already_closed without re-sending email when prompt already closed', async () => {
    const prompt = makePromptMock({ status: 'closed' });
    AvailabilityPrompt.findByPk.mockResolvedValue(prompt);

    const result = await lifecycleService.checkConsensusAndClose('prompt-uuid-1');

    expect(result.closed).toBe(false);
    expect(result.reason).toBe('already_closed');
    expect(prompt.update).not.toHaveBeenCalled();
    expect(emailService.send).not.toHaveBeenCalled();
  });
});

describe('promptLifecycleService.handlePromptClosed — recipient resolution', () => {
  it('Test 4: manual prompt resolves recipient via prompt.created_by_user_id', async () => {
    const prompt = makePromptMock({
      status: 'closed',
      created_by_user_id: 'user-uuid-creator',
    });
    AvailabilityResponse.count.mockResolvedValue(2);
    User.findByPk.mockImplementation(async (id) => {
      if (id === 'user-uuid-creator') {
        return {
          id: 'user-uuid-creator',
          email: 'creator@test.com',
          username: 'Creator',
          timezone: 'America/New_York',
          email_notifications_enabled: true,
        };
      }
      return null;
    });
    AvailabilitySuggestion.findAll.mockResolvedValue([
      { id: 's1', score: 4, suggested_start: new Date('2026-05-10T18:00:00Z'), suggested_end: new Date('2026-05-10T21:00:00Z'), meets_minimum: true },
    ]);
    emailService.send.mockResolvedValue({ success: true });

    await lifecycleService.handlePromptClosed(prompt);

    expect(User.findByPk).toHaveBeenCalledWith('user-uuid-creator');
    // Auto branches not consulted.
    expect(GroupPromptSettings.findByPk).not.toHaveBeenCalled();
    expect(emailService.send).toHaveBeenCalledTimes(1);
    expect(emailService.send.mock.calls[0][0].to).toBe('creator@test.com');
  });

  it('Test 5a: auto prompt with settings.created_by_user_id resolves recipient via settings creator', async () => {
    const prompt = makePromptMock({
      status: 'closed',
      created_by_user_id: null,
      created_by_settings_id: 'settings-uuid-1',
    });
    AvailabilityResponse.count.mockResolvedValue(2);
    GroupPromptSettings.findByPk.mockResolvedValue({
      id: 'settings-uuid-1',
      created_by_user_id: 'user-uuid-schedule-creator',
    });
    User.findByPk.mockImplementation(async (id) => {
      if (id === 'user-uuid-schedule-creator') {
        return {
          id: 'user-uuid-schedule-creator',
          email: 'admin-a@test.com',
          username: 'Admin A',
          timezone: 'UTC',
          email_notifications_enabled: true,
        };
      }
      return null;
    });
    AvailabilitySuggestion.findAll.mockResolvedValue([
      { id: 's1', score: 5, suggested_start: new Date('2026-05-10T18:00:00Z'), suggested_end: new Date('2026-05-10T21:00:00Z'), meets_minimum: true },
    ]);
    emailService.send.mockResolvedValue({ success: true });

    await lifecycleService.handlePromptClosed(prompt);

    expect(GroupPromptSettings.findByPk).toHaveBeenCalledWith('settings-uuid-1');
    expect(User.findByPk).toHaveBeenCalledWith('user-uuid-schedule-creator');
    // Group-owner fallback NOT consulted.
    expect(UserGroup.findOne).not.toHaveBeenCalled();
    expect(emailService.send).toHaveBeenCalledTimes(1);
    expect(emailService.send.mock.calls[0][0].to).toBe('admin-a@test.com');
  });

  it('Test 5b: auto prompt with NULL settings.created_by_user_id falls back to group owner via UserGroup', async () => {
    const prompt = makePromptMock({
      status: 'closed',
      created_by_user_id: null,
      created_by_settings_id: 'settings-uuid-1',
    });
    AvailabilityResponse.count.mockResolvedValue(2);
    GroupPromptSettings.findByPk.mockResolvedValue({
      id: 'settings-uuid-1',
      created_by_user_id: null, // legacy row — fallback path
    });
    UserGroup.findOne.mockResolvedValue({
      user_id: 'auth0|owner-sub',
      role: 'owner',
      status: 'active',
      group_id: 'group-uuid-1',
    });
    User.findOne.mockImplementation(async ({ where }) => {
      if (where && where.user_id === 'auth0|owner-sub') {
        return {
          id: 'user-uuid-owner',
          user_id: 'auth0|owner-sub',
          email: 'owner@test.com',
          username: 'Owner',
          timezone: 'UTC',
          email_notifications_enabled: true,
        };
      }
      return null;
    });
    AvailabilitySuggestion.findAll.mockResolvedValue([
      { id: 's1', score: 5, suggested_start: new Date('2026-05-10T18:00:00Z'), suggested_end: new Date('2026-05-10T21:00:00Z'), meets_minimum: true },
    ]);
    emailService.send.mockResolvedValue({ success: true });

    await lifecycleService.handlePromptClosed(prompt);

    // Settings was consulted.
    expect(GroupPromptSettings.findByPk).toHaveBeenCalledWith('settings-uuid-1');
    // Group owner lookup is the documented two-step path — UserGroup by role,
    // then User by Auth0 sub (NOT a single User.findByPk).
    expect(UserGroup.findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        group_id: 'group-uuid-1',
        role: 'owner',
      }),
    }));
    expect(User.findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ user_id: 'auth0|owner-sub' }),
    }));
    expect(emailService.send).toHaveBeenCalledTimes(1);
    expect(emailService.send.mock.calls[0][0].to).toBe('owner@test.com');
  });

  it('Test 6: zero responses → silent close, no email sent (D-CLOSE-03)', async () => {
    const prompt = makePromptMock({
      status: 'closed',
      created_by_user_id: 'user-uuid-creator',
    });
    AvailabilityResponse.count.mockResolvedValue(0);
    User.findByPk.mockResolvedValue({
      id: 'user-uuid-creator',
      email: 'creator@test.com',
      username: 'Creator',
      timezone: 'UTC',
      email_notifications_enabled: true,
    });

    await lifecycleService.handlePromptClosed(prompt);

    expect(emailService.send).not.toHaveBeenCalled();
  });

  it('Test 7: closing an auto-prompt does NOT modify GroupPromptSettings row', async () => {
    const prompt = makePromptMock({
      status: 'closed',
      created_by_user_id: null,
      created_by_settings_id: 'settings-uuid-1',
    });
    AvailabilityResponse.count.mockResolvedValue(2);

    // Provide a settings row instance with a spied-on update method.
    const settingsUpdateSpy = jest.fn();
    const settingsDestroySpy = jest.fn();
    const settingsSnapshot = {
      id: 'settings-uuid-1',
      group_id: 'group-uuid-1',
      template_name: 'Friday Sessions',
      created_by_user_id: 'user-uuid-schedule-creator',
      schedule_day_of_week: 5,
      schedule_time: '18:00:00',
      is_active: true,
    };
    GroupPromptSettings.findByPk.mockResolvedValue({
      ...settingsSnapshot,
      update: settingsUpdateSpy,
      destroy: settingsDestroySpy,
    });
    User.findByPk.mockResolvedValue({
      id: 'user-uuid-schedule-creator',
      email: 'admin-a@test.com',
      username: 'Admin A',
      timezone: 'UTC',
      email_notifications_enabled: true,
    });
    AvailabilitySuggestion.findAll.mockResolvedValue([
      { id: 's1', score: 5, suggested_start: new Date('2026-05-10T18:00:00Z'), suggested_end: new Date('2026-05-10T21:00:00Z'), meets_minimum: true },
    ]);
    emailService.send.mockResolvedValue({ success: true });

    await lifecycleService.handlePromptClosed(prompt);

    // The lifecycle service must NOT mutate the parent settings row.
    expect(settingsUpdateSpy).not.toHaveBeenCalled();
    expect(settingsDestroySpy).not.toHaveBeenCalled();
  });
});
