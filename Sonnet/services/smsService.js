// services/smsService.js
// SMS service for sending notifications using Twilio
const twilio = require('twilio');

class SmsService {
  constructor() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    this.fromNumber = process.env.TWILIO_PHONE_NUMBER;

    // Initialize Twilio client if credentials are configured
    if (accountSid && authToken) {
      this.client = twilio(accountSid, authToken);
      console.log(`Twilio SMS service initialized. From: ${this.fromNumber}`);
    } else {
      this.client = null;
      console.warn('Twilio SMS service not configured (credentials not set).');
    }
  }

  /**
   * Check if SMS service is configured
   * @returns {boolean} True if Twilio client and from number are set
   */
  isConfigured() {
    return !!(this.client && this.fromNumber);
  }

  /**
   * Send an SMS notification via Twilio
   * @param {Object} options - SMS options
   * @param {string} options.to - Recipient phone number (E.164 format)
   * @param {string} options.type - Notification type key
   * @param {Object} options.data - Template data fields
   * @returns {Promise<{success: boolean, sid?: string, error?: string}>}
   */
  async send({ to, type, data }) {
    if (!this.isConfigured()) {
      console.warn('SMS service not configured. Skipping SMS.');
      return { success: false, error: 'SMS service not configured' };
    }

    try {
      const body = this.buildMessage(type, data);

      const message = await this.client.messages.create({
        body,
        to,
        from: this.fromNumber
      });

      console.log(`SMS sent successfully. SID: ${message.sid}`);
      return { success: true, sid: message.sid };
    } catch (error) {
      console.error(`SMS send failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Build an SMS message body from a notification type and data
   * @param {string} type - Notification type key
   * @param {Object} data - Template data fields
   * @returns {string} SMS message body (max 160 chars)
   */
  buildMessage(type, data) {
    const templates = {
      event_confirmation: (d) =>
        `NextGameNight: ${d.gameName} is set for ${d.date}! ${d.actionUrl || ''}`.trim(),

      reminder: (d) =>
        `NextGameNight reminder: ${d.gameName} is ${d.date}. ${d.actionUrl || ''}`.trim(),

      availability_prompt: (d) =>
        `NextGameNight: ${d.groupName} wants to schedule a game. Share your availability: ${d.actionUrl || ''}`.trim(),

      no_consensus: (d) =>
        `NextGameNight: No consensus for ${d.groupName}. Review options: ${d.actionUrl || ''}`.trim(),

      group_invite: (d) =>
        `NextGameNight: ${d.inviterName} invited you to ${d.groupName}! ${d.actionUrl || ''}`.trim(),

      rsvp_magic_link: (d) =>
        `NextGameNight: RSVP for ${d.gameName} on ${d.date}: ${d.actionUrl || ''}`.trim(),

      friend_request: (d) =>
        `NextGameNight: ${d.requesterName} sent you a friend request! ${d.actionUrl || ''}`.trim()
    };

    const templateFn = templates[type];
    let message;

    if (templateFn) {
      message = templateFn(data || {});
    } else {
      message = `NextGameNight notification: ${(data && data.actionUrl) || 'Check the app for details'}`;
    }

    // Truncate to 160 chars (SMS segment limit)
    if (message.length > 160) {
      return message.substring(0, 157) + '...';
    }

    return message;
  }
}

module.exports = new SmsService();
