// services/emailService.js
// Email service for sending notifications using Resend API
const { Resend } = require('resend');

class EmailService {
  constructor() {
    this.apiKey = process.env.RESEND_API_KEY;
    this.fromEmail = process.env.FROM_EMAIL || 'schedule@nextgamenight.app';
    this.frontendUrl = process.env.FRONTEND_URL || process.env.AUTH0_BASE_URL || 'http://localhost:3000';

    // Initialize Resend client if API key is configured
    this.resend = null;
    if (this.apiKey) {
      this.resend = new Resend(this.apiKey);
      console.log('Resend email service initialized.');
      console.log(`   From: ${this.fromEmail}`);
    } else {
      console.warn('Resend email service not configured (RESEND_API_KEY not set).');
      if (process.env.NODE_ENV === 'production') {
        console.warn('WARNING: Email notifications will be disabled in production!');
      }
    }
  }

  /**
   * Check if email service is configured
   * @returns {boolean} True if Resend API key is set
   */
  isConfigured() {
    return !!this.apiKey && !!this.resend;
  }

  /**
   * Send a single email via Resend API
   * @param {Object} options - Email options
   * @param {string|string[]} options.to - Recipient email(s)
   * @param {string} options.subject - Email subject
   * @param {React.ReactElement} [options.react] - React Email component
   * @param {string} [options.html] - HTML content (fallback if no react)
   * @param {string} [options.text] - Plain text content
   * @param {string} [options.replyTo] - Reply-to address (typically group owner)
   * @param {string} [options.groupName] - Group name for from field
   * @returns {Promise<{success: boolean, id?: string, error?: string}>}
   */
  async send({ to, subject, react, html, text, replyTo, groupName }) {
    if (!this.isConfigured()) {
      console.warn('Email service not configured. Skipping email.');
      return { success: false, error: 'Email service not configured' };
    }

    try {
      // Format the from field: "[Group Name] via NextGameNight" or just the email
      const fromName = groupName
        ? `${groupName} via NextGameNight`
        : 'NextGameNight';
      const from = `${fromName} <${this.fromEmail}>`;

      const emailOptions = {
        from,
        to: Array.isArray(to) ? to : [to],
        subject,
        ...(replyTo && { reply_to: replyTo }),
      };

      // Prefer React component, fall back to HTML/text
      if (react) {
        emailOptions.react = react;
      } else if (html) {
        emailOptions.html = html;
      }

      if (text) {
        emailOptions.text = text;
      }

      const result = await this.resend.emails.send(emailOptions);

      if (result.error) {
        console.error(`Email send failed: ${result.error.message}`);
        return { success: false, error: result.error.message };
      }

      console.log(`Email sent successfully. ID: ${result.data?.id}`);
      return { success: true, id: result.data?.id };
    } catch (error) {
      console.error(`Email send error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send emails to multiple recipients (batch send)
   * Resend allows max 100 emails per batch API call
   * @param {Array<{email: string, name?: string, data?: Object}>} recipients - List of recipients
   * @param {Object} options - Email options (shared across all recipients)
   * @param {string} options.subject - Email subject
   * @param {React.ReactElement|Function} options.react - React component or function(recipient) => component
   * @param {string} [options.html] - HTML content fallback
   * @param {string} [options.text] - Plain text fallback
   * @param {string} [options.replyTo] - Reply-to address
   * @param {string} [options.groupName] - Group name for from field
   * @returns {Promise<{success: boolean, total: number, successful: number, failed: number, results: Array}>}
   */
  async sendBatch(recipients, { subject, react, html, text, replyTo, groupName }) {
    if (!this.isConfigured()) {
      console.warn('Email service not configured. Skipping batch email.');
      return {
        success: false,
        error: 'Email service not configured',
        total: recipients.length,
        successful: 0,
        failed: recipients.length,
        results: []
      };
    }

    if (!recipients || recipients.length === 0) {
      return {
        success: true,
        total: 0,
        successful: 0,
        failed: 0,
        results: []
      };
    }

    // Chunk recipients into batches of 50 (being conservative, Resend allows 100)
    const chunks = this.chunk(recipients, 50);
    const allResults = [];
    let totalSuccessful = 0;
    let totalFailed = 0;

    for (const chunk of chunks) {
      // Send emails in parallel within each chunk
      const chunkPromises = chunk.map(async (recipient) => {
        const recipientEmail = typeof recipient === 'string' ? recipient : recipient.email;
        const recipientName = typeof recipient === 'string' ? null : recipient.name;

        try {
          // If react is a function, call it with recipient data to personalize
          const reactComponent = typeof react === 'function'
            ? react({ ...recipient, name: recipientName })
            : react;

          const result = await this.send({
            to: recipientEmail,
            subject,
            react: reactComponent,
            html,
            text,
            replyTo,
            groupName
          });

          if (result.success) {
            totalSuccessful++;
          } else {
            totalFailed++;
          }

          return { recipient: recipientEmail, ...result };
        } catch (error) {
          totalFailed++;
          return {
            recipient: recipientEmail,
            success: false,
            error: error.message
          };
        }
      });

      const chunkResults = await Promise.allSettled(chunkPromises);

      chunkResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          allResults.push(result.value);
        } else {
          allResults.push({
            recipient: 'unknown',
            success: false,
            error: result.reason?.message || 'Unknown error'
          });
          totalFailed++;
        }
      });
    }

    console.log(`Batch email results: ${totalSuccessful} sent, ${totalFailed} failed`);

    return {
      success: totalSuccessful > 0,
      total: recipients.length,
      successful: totalSuccessful,
      failed: totalFailed,
      results: allResults
    };
  }

  /**
   * Split array into chunks of specified size
   * @param {Array} array - Array to chunk
   * @param {number} size - Chunk size
   * @returns {Array<Array>} Array of chunks
   */
  chunk(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Format event date for display
   * @param {Date|string} date - Date to format
   * @returns {string} Formatted date string
   */
  formatEventDate(date) {
    const eventDate = new Date(date);
    return eventDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  /**
   * Calculate end time from start time and duration
   * @param {string} startTime - Start time in HH:MM format
   * @param {number} durationMinutes - Duration in minutes
   * @returns {string} End time in HH:MM format
   */
  calculateEndTime(startTime, durationMinutes) {
    if (!startTime || !durationMinutes) return '';

    try {
      const [hours, minutes] = startTime.split(':').map(Number);
      const startDate = new Date();
      startDate.setHours(hours, minutes, 0, 0);

      const endDate = new Date(startDate.getTime() + durationMinutes * 60000);
      const endHours = String(endDate.getHours()).padStart(2, '0');
      const endMinutes = String(endDate.getMinutes()).padStart(2, '0');

      return `${endHours}:${endMinutes}`;
    } catch (error) {
      console.error('Error calculating end time:', error);
      return '';
    }
  }

  // ============================================
  // Legacy methods (to be updated in Phase 7)
  // These maintain API compatibility with existing code
  // ============================================

  /**
   * Generate email template for game session notification
   * @deprecated Use React Email templates instead (Phase 2, Plan 2)
   */
  generateGameSessionEmailTemplate(eventData) {
    const { gameName, groupName, startDate, startTime, durationMinutes, location, comments, eventUrl, recipientName } = eventData;

    const formattedDate = this.formatEventDate(startDate);
    const endTime = this.calculateEndTime(startTime, durationMinutes);

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
    .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 5px 5px; }
    .event-details { background-color: white; padding: 20px; margin: 20px 0; border-radius: 5px; border-left: 4px solid #4F46E5; }
    .event-detail-row { margin: 10px 0; }
    .event-detail-label { font-weight: bold; color: #6B7280; }
    .event-detail-value { color: #111827; margin-left: 10px; }
    .button { display: inline-block; padding: 12px 24px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
    .footer { text-align: center; color: #6B7280; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #E5E7EB; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>New Game Session Scheduled!</h1>
    </div>
    <div class="content">
      <p>Hi ${recipientName || 'there'},</p>

      <p>A new game session has been scheduled for your group <strong>${groupName}</strong>.</p>

      <div class="event-details">
        <div class="event-detail-row">
          <span class="event-detail-label">Game:</span>
          <span class="event-detail-value">${gameName}</span>
        </div>
        <div class="event-detail-row">
          <span class="event-detail-label">Date:</span>
          <span class="event-detail-value">${formattedDate}</span>
        </div>
        <div class="event-detail-row">
          <span class="event-detail-label">Time:</span>
          <span class="event-detail-value">${startTime} - ${endTime}</span>
        </div>
        ${durationMinutes ? `
        <div class="event-detail-row">
          <span class="event-detail-label">Duration:</span>
          <span class="event-detail-value">${durationMinutes} minutes</span>
        </div>
        ` : ''}
        ${location ? `
        <div class="event-detail-row">
          <span class="event-detail-label">Location:</span>
          <span class="event-detail-value">${location}</span>
        </div>
        ` : ''}
        ${comments ? `
        <div class="event-detail-row">
          <span class="event-detail-label">Notes:</span>
          <span class="event-detail-value">${comments}</span>
        </div>
        ` : ''}
      </div>

      <div style="text-align: center;">
        <a href="${eventUrl}" class="button">View Event Details</a>
      </div>

      <p>We hope to see you there!</p>

      <div class="footer">
        <p>This is an automated notification from PeriodicTableTop.</p>
        <p>You can manage your notification preferences in your <a href="${this.frontendUrl}/userProfile">profile settings</a>.</p>
      </div>
    </div>
  </div>
</body>
</html>
    `.trim();

    const text = `
New Game Session Scheduled!

Hi ${recipientName || 'there'},

A new game session has been scheduled for your group "${groupName}".

Event Details:
- Game: ${gameName}
- Date: ${formattedDate}
- Time: ${startTime} - ${endTime}
${durationMinutes ? `- Duration: ${durationMinutes} minutes\n` : ''}
${location ? `- Location: ${location}\n` : ''}
${comments ? `- Notes: ${comments}\n` : ''}

View event details: ${eventUrl}

We hope to see you there!

---
This is an automated notification from PeriodicTableTop.
You can manage your notification preferences in your profile: ${this.frontendUrl}/userProfile
    `.trim();

    return { html, text };
  }

  /**
   * Send game session notification email
   * @deprecated Will be updated to use React Email templates in Phase 7
   */
  async sendGameSessionNotification(recipientEmail, recipientName, eventData) {
    const { html, text } = this.generateGameSessionEmailTemplate({
      ...eventData,
      recipientName
    });

    return this.send({
      to: recipientEmail,
      subject: `New Game Session: ${eventData.gameName} - ${eventData.groupName}`,
      html,
      text,
      groupName: eventData.groupName
    });
  }

  /**
   * Send email notification to multiple recipients
   * @deprecated Will be updated to use React Email templates in Phase 7
   */
  async sendGameSessionNotificationToMultiple(recipients, eventData) {
    const recipientList = recipients.map(r => ({
      email: r.email,
      name: r.name || r.username
    }));

    const { html, text } = this.generateGameSessionEmailTemplate(eventData);

    return this.sendBatch(recipientList, {
      subject: `New Game Session: ${eventData.gameName} - ${eventData.groupName}`,
      html,
      text,
      groupName: eventData.groupName
    });
  }
}

module.exports = new EmailService();
