// services/emailService.js
// Email service for sending notifications using SendGrid
const sgMail = require('@sendgrid/mail');

class EmailService {
  constructor() {
    this.apiKey = process.env.SENDGRID_API_KEY;
    this.fromEmail = process.env.SENDGRID_FROM_EMAIL || process.env.FROM_EMAIL || 'noreply@periodictabletop.com';
    this.frontendUrl = process.env.FRONTEND_URL || process.env.AUTH0_BASE_URL || 'http://localhost:3000';
    
    // Initialize SendGrid if API key is provided
    if (this.apiKey) {
      sgMail.setApiKey(this.apiKey);
    } else if (process.env.NODE_ENV === 'production') {
      console.warn('⚠️  WARNING: SENDGRID_API_KEY not set. Email notifications will be disabled.');
    }
  }

  /**
   * Check if email service is configured
   */
  isConfigured() {
    return !!this.apiKey;
  }

  /**
   * Generate email template for game session notification
   */
  generateGameSessionEmailTemplate(eventData) {
    const { gameName, groupName, startDate, startTime, durationMinutes, location, comments, eventUrl, recipientName } = eventData;
    
    // Format date for display
    const eventDate = new Date(startDate);
    const formattedDate = eventDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    // Calculate end time
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
      <h1>🎲 New Game Session Scheduled!</h1>
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

    // Plain text version
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
   * Calculate end time from start time and duration
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

  /**
   * Send game session notification email
   */
  async sendGameSessionNotification(recipientEmail, recipientName, eventData) {
    if (!this.isConfigured()) {
      console.warn('Email service not configured. Skipping email notification.');
      return { success: false, error: 'Email service not configured' };
    }

    try {
      const { html, text } = this.generateGameSessionEmailTemplate({
        ...eventData,
        recipientName
      });

      const msg = {
        to: recipientEmail,
        from: this.fromEmail,
        subject: `New Game Session: ${eventData.gameName} - ${eventData.groupName}`,
        text: text,
        html: html,
      };

      await sgMail.send(msg);
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`✅ Email sent to ${recipientEmail} for game session: ${eventData.gameName}`);
      }
      
      return { success: true };
    } catch (error) {
      console.error('Error sending game session notification email:', error);
      
      // Log detailed error in development
      if (process.env.NODE_ENV === 'development' && error.response) {
        console.error('SendGrid error details:', error.response.body);
      }
      
      return { success: false, error: error.message };
    }
  }

  /**
   * Send email notification to multiple recipients
   * Handles failures gracefully - continues sending even if some fail
   */
  async sendGameSessionNotificationToMultiple(recipients, eventData) {
    if (!this.isConfigured()) {
      console.warn('Email service not configured. Skipping email notifications.');
      return { success: false, error: 'Email service not configured' };
    }

    const results = [];
    
    // Send emails in parallel, but handle errors gracefully
    const emailPromises = recipients.map(async (recipient) => {
      try {
        const result = await this.sendGameSessionNotification(
          recipient.email,
          recipient.name || recipient.username,
          eventData
        );
        return { recipient: recipient.email, ...result };
      } catch (error) {
        console.error(`Failed to send email to ${recipient.email}:`, error.message);
        return { recipient: recipient.email, success: false, error: error.message };
      }
    });

    const emailResults = await Promise.allSettled(emailPromises);
    
    emailResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        console.error(`Email promise rejected for recipient ${index}:`, result.reason);
        results.push({ recipient: recipients[index]?.email || 'unknown', success: false, error: result.reason?.message || 'Unknown error' });
      }
    });

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;

    if (process.env.NODE_ENV === 'development' || failureCount > 0) {
      console.log(`Email notification results: ${successCount} sent, ${failureCount} failed`);
    }

    return {
      success: successCount > 0,
      total: results.length,
      successful: successCount,
      failed: failureCount,
      results: results
    };
  }
}

module.exports = new EmailService();
