// tests/services/smsService.test.js
// Unit tests for smsService with mocked Twilio SDK

const mockCreate = jest.fn().mockResolvedValue({ sid: 'SM_TEST_123' });
jest.mock('twilio', () => {
  return jest.fn(() => ({
    messages: {
      create: mockCreate
    }
  }));
});

describe('smsService', () => {

  let smsService;

  beforeAll(() => {
    // Reset module registry to get a fresh instance with mocked twilio
    jest.resetModules();

    // Set env vars before requiring the service
    process.env.TWILIO_ACCOUNT_SID = 'AC_TEST_SID';
    process.env.TWILIO_AUTH_TOKEN = 'test_auth_token';
    process.env.TWILIO_PHONE_NUMBER = '+15005550006';

    // Re-mock twilio after resetModules
    jest.mock('twilio', () => {
      return jest.fn(() => ({
        messages: {
          create: mockCreate
        }
      }));
    });

    smsService = require('../../services/smsService');
  });

  afterAll(() => {
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_PHONE_NUMBER;
  });

  beforeEach(() => {
    mockCreate.mockClear();
    mockCreate.mockResolvedValue({ sid: 'SM_TEST_123' });
  });

  // =============================================
  // buildMessage tests
  // =============================================
  describe('buildMessage', () => {

    it('renders event_confirmation template with game name and date', () => {
      const msg = smsService.buildMessage('event_confirmation', {
        gameName: 'Catan',
        date: 'Friday April 4th'
      });
      expect(msg).toContain('Catan');
      expect(msg).toContain('Friday April 4th');
      expect(msg).toContain('NextGameNight');
    });

    it('renders all 7 notification types without error', () => {
      const types = [
        'event_confirmation',
        'reminder',
        'availability_prompt',
        'no_consensus',
        'group_invite',
        'rsvp_magic_link',
        'friend_request'
      ];

      const testData = {
        gameName: 'Catan',
        date: 'Friday',
        groupName: 'Board Gamers',
        inviterName: 'Alice',
        requesterName: 'Bob',
        actionUrl: 'https://app.test/action'
      };

      types.forEach((type) => {
        const msg = smsService.buildMessage(type, testData);
        expect(typeof msg).toBe('string');
        expect(msg.length).toBeGreaterThan(0);
        expect(msg.length).toBeLessThanOrEqual(160);
      });
    });

    it('truncates messages over 160 characters', () => {
      const msg = smsService.buildMessage('event_confirmation', {
        gameName: 'A Very Long Game Name That Goes On And On And On And Takes Up Lots Of Characters',
        date: 'Saturday March 29th 2026 at 7:00 PM Eastern Standard Time',
        actionUrl: 'https://nextgamenight.app/events/some-really-long-uuid-here'
      });
      expect(msg.length).toBeLessThanOrEqual(160);
      expect(msg).toMatch(/\.\.\.$/);
    });

    it('returns fallback for unknown type', () => {
      const msg = smsService.buildMessage('unknown_type', { actionUrl: 'https://app.test' });
      expect(msg).toContain('NextGameNight');
      expect(msg).toContain('notification');
    });
  });

  // =============================================
  // send tests (with mocked Twilio)
  // =============================================
  describe('send', () => {

    it('calls twilio messages.create with correct params when configured', async () => {
      const result = await smsService.send({
        to: '+14155551234',
        type: 'event_confirmation',
        data: { gameName: 'Catan', date: 'Friday' }
      });

      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(mockCreate).toHaveBeenCalledWith({
        body: expect.stringContaining('Catan'),
        to: '+14155551234',
        from: '+15005550006'
      });
      expect(result).toEqual({ success: true, sid: 'SM_TEST_123' });
    });

    it('returns success false when not configured (no env vars)', () => {
      // Create a fresh instance without credentials
      jest.resetModules();

      // Clear env
      delete process.env.TWILIO_ACCOUNT_SID;
      delete process.env.TWILIO_AUTH_TOKEN;
      delete process.env.TWILIO_PHONE_NUMBER;

      jest.mock('twilio', () => {
        return jest.fn(() => ({
          messages: { create: mockCreate }
        }));
      });

      const unconfiguredService = require('../../services/smsService');
      expect(unconfiguredService.isConfigured()).toBe(false);

      // Restore for other tests
      process.env.TWILIO_ACCOUNT_SID = 'AC_TEST_SID';
      process.env.TWILIO_AUTH_TOKEN = 'test_auth_token';
      process.env.TWILIO_PHONE_NUMBER = '+15005550006';
    });
  });

  // =============================================
  // isConfigured tests
  // =============================================
  describe('isConfigured', () => {

    it('returns false when client is not initialized', () => {
      jest.resetModules();

      delete process.env.TWILIO_ACCOUNT_SID;
      delete process.env.TWILIO_AUTH_TOKEN;
      delete process.env.TWILIO_PHONE_NUMBER;

      jest.mock('twilio', () => {
        return jest.fn(() => ({
          messages: { create: mockCreate }
        }));
      });

      const unconfiguredService = require('../../services/smsService');
      expect(unconfiguredService.isConfigured()).toBe(false);

      // Restore env
      process.env.TWILIO_ACCOUNT_SID = 'AC_TEST_SID';
      process.env.TWILIO_AUTH_TOKEN = 'test_auth_token';
      process.env.TWILIO_PHONE_NUMBER = '+15005550006';
    });
  });
});
