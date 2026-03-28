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
        notification_preferences: null
      };
      expect(notificationService.getPreference(user, 'event_confirmation', 'sms')).toBe(false);
    });

    it('returns false for sms when sms_enabled is false even with explicit true preference', () => {
      const user = {
        email_notifications_enabled: true,
        sms_enabled: false,
        phone: '+14155551234',
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
        notification_preferences: {
          event_confirmation: { sms: true }
        }
      };
      expect(notificationService.getPreference(user, 'event_confirmation', 'sms')).toBe(false);
    });

    it('returns true for sms ONLY when sms_enabled=true AND phone exists AND explicit preference is true', () => {
      const user = {
        email_notifications_enabled: true,
        sms_enabled: true,
        phone: '+14155551234',
        notification_preferences: {
          event_confirmation: { sms: true }
        }
      };
      expect(notificationService.getPreference(user, 'event_confirmation', 'sms')).toBe(true);
    });

    it('returns false for sms when sms_enabled=true AND phone exists but no explicit preference (default=false)', () => {
      const user = {
        email_notifications_enabled: true,
        sms_enabled: true,
        phone: '+14155551234',
        notification_preferences: null
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

    it('dispatches to both when user has explicit sms preference and sms_enabled+phone', async () => {
      const user = {
        email_notifications_enabled: true,
        sms_enabled: true,
        phone: '+14155551234',
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

      emailService.send.mockRejectedValue(new Error('SendGrid timeout'));

      const payload = {
        emailParams: { to: 'user@test.com', subject: 'Test', html: '<p>hi</p>' },
        data: {}
      };

      const results = await notificationService.send(user, 'event_confirmation', payload);

      expect(results.email).toEqual({ success: false, error: 'SendGrid timeout' });
      expect(results.sms).toBeNull();
    });

    it('handles smsService error gracefully', async () => {
      const user = {
        email_notifications_enabled: false,
        sms_enabled: true,
        phone: '+14155551234',
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
});
