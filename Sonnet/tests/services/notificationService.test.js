// tests/services/notificationService.test.js
// Unit tests for notificationService getPreference and send routing

// Mock emailService and smsService before requiring notificationService
jest.mock('../../services/emailService', () => ({
  send: jest.fn()
}));

jest.mock('../../services/smsService', () => ({
  send: jest.fn()
}));

const notificationService = require('../../services/notificationService');
const emailService = require('../../services/emailService');
const smsService = require('../../services/smsService');

describe('notificationService', () => {

  // =============================================
  // getPreference tests
  // =============================================
  describe('getPreference', () => {

    // --- Email channel tests ---

    it('returns true for email with null preferences (default)', () => {
      const user = {
        email_notifications_enabled: true,
        sms_enabled: false,
        phone: null,
        notification_preferences: null
      };
      expect(notificationService.getPreference(user, 'event_confirmation', 'email')).toBe(true);
    });

    it('returns false for email when email_notifications_enabled is false', () => {
      const user = {
        email_notifications_enabled: false,
        sms_enabled: false,
        phone: null,
        notification_preferences: null
      };
      expect(notificationService.getPreference(user, 'event_confirmation', 'email')).toBe(false);
    });

    it('returns true for email when explicit preference is true', () => {
      const user = {
        email_notifications_enabled: true,
        sms_enabled: false,
        phone: null,
        notification_preferences: {
          event_confirmation: { email: true }
        }
      };
      expect(notificationService.getPreference(user, 'event_confirmation', 'email')).toBe(true);
    });

    it('returns false for email when explicit preference is false', () => {
      const user = {
        email_notifications_enabled: true,
        sms_enabled: false,
        phone: null,
        notification_preferences: {
          event_confirmation: { email: false }
        }
      };
      expect(notificationService.getPreference(user, 'event_confirmation', 'email')).toBe(false);
    });

    it('returns true for email when type not in preferences (falls to default)', () => {
      const user = {
        email_notifications_enabled: true,
        sms_enabled: false,
        phone: null,
        notification_preferences: {
          reminder: { email: false }  // different type
        }
      };
      expect(notificationService.getPreference(user, 'event_confirmation', 'email')).toBe(true);
    });

    // --- SMS channel tests (double-gate) ---

    it('returns false for sms with null preferences (default = false)', () => {
      const user = {
        email_notifications_enabled: true,
        sms_enabled: true,
        phone: '+14155551234',
        phone_verified: true,
        notification_preferences: null
      };
      expect(notificationService.getPreference(user, 'event_confirmation', 'sms')).toBe(false);
    });

    it('returns false for sms when sms_enabled is false even with explicit true preference', () => {
      const user = {
        email_notifications_enabled: true,
        sms_enabled: false,
        phone: '+14155551234',
        phone_verified: true,
        notification_preferences: {
          event_confirmation: { sms: true }
        }
      };
      expect(notificationService.getPreference(user, 'event_confirmation', 'sms')).toBe(false);
    });

    it('returns false for sms when phone is null even with sms_enabled=true and explicit preference', () => {
      const user = {
        email_notifications_enabled: true,
        sms_enabled: true,
        phone: null,
        notification_preferences: {
          event_confirmation: { sms: true }
        }
      };
      expect(notificationService.getPreference(user, 'event_confirmation', 'sms')).toBe(false);
    });

    it('returns false for sms when phone is empty string even with sms_enabled=true', () => {
      const user = {
        email_notifications_enabled: true,
        sms_enabled: true,
        phone: '',
        phone_verified: true,
        notification_preferences: {
          event_confirmation: { sms: true }
        }
      };
      expect(notificationService.getPreference(user, 'event_confirmation', 'sms')).toBe(false);
    });

    it('returns true for sms ONLY when sms_enabled=true AND phone exists AND phone_verified AND explicit preference is true', () => {
      const user = {
        email_notifications_enabled: true,
        sms_enabled: true,
        phone: '+14155551234',
        phone_verified: true,
        notification_preferences: {
          event_confirmation: { sms: true }
        }
      };
      expect(notificationService.getPreference(user, 'event_confirmation', 'sms')).toBe(true);
    });

    it('returns false for sms when sms_enabled=true AND phone exists AND phone_verified but no explicit preference (default=false)', () => {
      const user = {
        email_notifications_enabled: true,
        sms_enabled: true,
        phone: '+14155551234',
        phone_verified: true,
        notification_preferences: null
      };
      expect(notificationService.getPreference(user, 'event_confirmation', 'sms')).toBe(false);
    });

    it('returns false for sms when phone_verified is false even with sms_enabled=true AND phone AND explicit preference', () => {
      const user = {
        email_notifications_enabled: true,
        sms_enabled: true,
        phone: '+14155551234',
        phone_verified: false,
        notification_preferences: {
          event_confirmation: { sms: true }
        }
      };
      expect(notificationService.getPreference(user, 'event_confirmation', 'sms')).toBe(false);
    });
  });

  // =============================================
  // send tests
  // =============================================
  describe('send', () => {

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('dispatches to email only for default user (null prefs)', async () => {
      const user = {
        email_notifications_enabled: true,
        sms_enabled: false,
        phone: null,
        notification_preferences: null
      };

      emailService.send.mockResolvedValue({ success: true, id: 'msg_123' });

      const payload = {
        emailParams: { to: 'user@test.com', subject: 'Test', html: '<p>hi</p>' },
        data: { gameName: 'Catan', date: 'Friday' }
      };

      const results = await notificationService.send(user, 'event_confirmation', payload);

      expect(emailService.send).toHaveBeenCalledWith(payload.emailParams);
      expect(smsService.send).not.toHaveBeenCalled();
      expect(results.email).toEqual({ success: true, id: 'msg_123' });
      expect(results.sms).toBeNull();
    });

    it('dispatches to both when user has explicit sms preference and sms_enabled+phone+phone_verified', async () => {
      const user = {
        email_notifications_enabled: true,
        sms_enabled: true,
        phone: '+14155551234',
        phone_verified: true,
        notification_preferences: {
          event_confirmation: { email: true, sms: true }
        }
      };

      emailService.send.mockResolvedValue({ success: true, id: 'msg_456' });
      smsService.send.mockResolvedValue({ success: true, sid: 'SM_789' });

      const payload = {
        emailParams: { to: 'user@test.com', subject: 'Test', html: '<p>hi</p>' },
        data: { gameName: 'Catan', date: 'Friday' }
      };

      const results = await notificationService.send(user, 'event_confirmation', payload);

      expect(emailService.send).toHaveBeenCalledWith(payload.emailParams);
      expect(smsService.send).toHaveBeenCalledWith({
        to: '+14155551234',
        type: 'event_confirmation',
        data: payload.data
      });
      expect(results.email).toEqual({ success: true, id: 'msg_456' });
      expect(results.sms).toEqual({ success: true, sid: 'SM_789' });
    });

    it('dispatches to neither when email disabled and no sms preference', async () => {
      const user = {
        email_notifications_enabled: false,
        sms_enabled: false,
        phone: null,
        notification_preferences: null
      };

      const payload = {
        emailParams: { to: 'user@test.com', subject: 'Test', html: '<p>hi</p>' },
        data: { gameName: 'Catan', date: 'Friday' }
      };

      const results = await notificationService.send(user, 'event_confirmation', payload);

      expect(emailService.send).not.toHaveBeenCalled();
      expect(smsService.send).not.toHaveBeenCalled();
      expect(results.email).toBeNull();
      expect(results.sms).toBeNull();
    });

    it('handles emailService error gracefully (does not throw, returns error in results)', async () => {
      const user = {
        email_notifications_enabled: true,
        sms_enabled: false,
        phone: null,
        notification_preferences: null
      };

      emailService.send.mockRejectedValue(new Error('Resend timeout'));

      const payload = {
        emailParams: { to: 'user@test.com', subject: 'Test', html: '<p>hi</p>' },
        data: {}
      };

      const results = await notificationService.send(user, 'event_confirmation', payload);

      expect(results.email).toEqual({ success: false, error: 'Resend timeout' });
      expect(results.sms).toBeNull();
    });

    it('handles smsService error gracefully', async () => {
      const user = {
        email_notifications_enabled: false,
        sms_enabled: true,
        phone: '+14155551234',
        phone_verified: true,
        notification_preferences: {
          reminder: { sms: true }
        }
      };

      smsService.send.mockRejectedValue(new Error('Twilio rate limit'));

      const payload = {
        emailParams: { to: 'user@test.com', subject: 'Test', html: '<p>hi</p>' },
        data: { gameName: 'Catan', date: 'Friday' }
      };

      const results = await notificationService.send(user, 'reminder', payload);

      expect(emailService.send).not.toHaveBeenCalled();
      expect(results.email).toBeNull();
      expect(results.sms).toEqual({ success: false, error: 'Twilio rate limit' });
    });
  });

  // =============================================
  // sendToMany tests (Phase 50)
  // =============================================
  describe('sendToMany', () => {

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('dispatches to all users and returns per-user results', async () => {
      const users = [
        {
          user_id: 'user-1',
          email_notifications_enabled: true,
          sms_enabled: false,
          phone: null,
          phone_verified: false,
          notification_preferences: { event_created: { email: true } }
        },
        {
          user_id: 'user-2',
          email_notifications_enabled: false,
          sms_enabled: true,
          phone: '+14155551111',
          phone_verified: true,
          notification_preferences: { event_created: { sms: true } }
        },
        {
          user_id: 'user-3',
          email_notifications_enabled: true,
          sms_enabled: true,
          phone: '+14155552222',
          phone_verified: true,
          notification_preferences: { event_created: { email: true, sms: true } }
        }
      ];

      emailService.send.mockResolvedValue({ success: true, id: 'msg_100' });
      smsService.send.mockResolvedValue({ success: true, sid: 'SM_200' });

      const payloadBuilder = (user) => ({
        emailParams: { to: `${user.user_id}@test.com`, subject: 'Event', html: '<p>hi</p>' },
        data: { eventName: 'Game Night', groupName: 'Gamers', dateTime: 'Friday' }
      });

      const results = await notificationService.sendToMany(users, 'event_created', payloadBuilder);

      expect(results).toHaveLength(3);
      expect(results.find(r => r.userId === 'user-1')).toBeDefined();
      expect(results.find(r => r.userId === 'user-2')).toBeDefined();
      expect(results.find(r => r.userId === 'user-3')).toBeDefined();
    });

    it('handles partial failures gracefully', async () => {
      const users = [
        {
          user_id: 'user-ok',
          email_notifications_enabled: true,
          sms_enabled: true,
          phone: '+14155551111',
          phone_verified: true,
          notification_preferences: { event_created: { sms: true } }
        },
        {
          user_id: 'user-fail',
          email_notifications_enabled: true,
          sms_enabled: true,
          phone: '+14155552222',
          phone_verified: true,
          notification_preferences: { event_created: { sms: true } }
        }
      ];

      emailService.send.mockResolvedValue({ success: true, id: 'msg_ok' });
      // smsService.send succeeds for first call, fails for second
      smsService.send
        .mockResolvedValueOnce({ success: true, sid: 'SM_OK' })
        .mockRejectedValueOnce(new Error('Twilio timeout'));

      const payloadBuilder = (user) => ({
        emailParams: { to: `${user.user_id}@test.com`, subject: 'Event', html: '<p>hi</p>' },
        data: { eventName: 'Game Night', groupName: 'Gamers', dateTime: 'Friday' }
      });

      // Should not throw
      const results = await notificationService.sendToMany(users, 'event_created', payloadBuilder);

      expect(results).toHaveLength(2);
      const okResult = results.find(r => r.userId === 'user-ok');
      const failResult = results.find(r => r.userId === 'user-fail');
      expect(okResult).toBeDefined();
      expect(failResult).toBeDefined();
      // The fail user's sms result should show the error (caught by send())
      expect(failResult.sms).toEqual({ success: false, error: 'Twilio timeout' });
    });

    it('works with empty users array', async () => {
      const results = await notificationService.sendToMany([], 'event_created', () => ({}));
      expect(results).toEqual([]);
    });
  });
});
