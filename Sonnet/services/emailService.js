// services/emailService.js
// Email service for sending notifications using Porkbun SMTP via nodemailer
const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.emailPassword = process.env.EMAIL_PASSWORD;
    this.fromEmail = process.env.FROM_EMAIL || 'noreply@nextgamenight.app';
    this.frontendUrl = process.env.FRONTEND_URL || process.env.AUTH0_BASE_URL || 'http://localhost:3000';
    
    // SMTP configuration for Porkbun - try port 587 first (STARTTLS)
    this.smtpConfig = {
      host: 'smtp.porkbun.com',
      port: 587,
      secure: false, // Use TLS/STARTTLS (not SSL)
      connectionTimeout: 10000, // 10 seconds connection timeout
      socketTimeout: 10000, // 10 seconds socket timeout
      greetingTimeout: 10000, // 10 seconds greeting timeout
      auth: {
        user: 'noreply@nextgamenight.app',
        pass: this.emailPassword
      },
      tls: {
        // Do not fail on invalid certificates
        rejectUnauthorized: false
      }
    };
    
    // Fallback configuration for port 50587 (STARTTLS - alternative port if 587 is blocked)
    this.smtpConfigFallback1 = {
      host: 'smtp.porkbun.com',
      port: 50587,
      secure: false, // Use STARTTLS (same as 587)
      connectionTimeout: 10000,
      socketTimeout: 10000,
      greetingTimeout: 10000,
      auth: {
        user: 'noreply@nextgamenight.app',
        pass: this.emailPassword
      },
      tls: {
        rejectUnauthorized: false
      }
    };
    
    // Fallback configuration for port 465 (SSL)
    this.smtpConfigFallback2 = {
      host: 'smtp.porkbun.com',
      port: 465,
      secure: true, // Use SSL for port 465
      connectionTimeout: 10000,
      socketTimeout: 10000,
      greetingTimeout: 10000,
      auth: {
        user: 'noreply@nextgamenight.app',
        pass: this.emailPassword
      },
      tls: {
        rejectUnauthorized: false
      }
    };
    
    // Create transporter if password is configured
    this.transporter = null;
    this.currentPort = 587; // Track which port we're using
    
    if (this.emailPassword) {
      this.initializeTransporter();
    } else if (process.env.NODE_ENV === 'production') {
      console.warn('⚠️  WARNING: EMAIL_PASSWORD not set. Email notifications will be disabled.');
    }
    
    // Log configuration (hide password)
    if (this.emailPassword) {
      console.log('📧 Email service configuration:');
      console.log(`   Host: ${this.smtpConfig.host}`);
      console.log(`   Port: ${this.smtpConfig.port} (STARTTLS)`);
      console.log(`   From: ${this.fromEmail}`);
      console.log(`   Username: ${this.smtpConfig.auth.user}`);
      console.log(`   Password: ${'*'.repeat(this.emailPassword.length)} (${this.emailPassword.length} chars)`);
    }
  }
  
  /**
   * Initialize transporter with primary config
   */
  initializeTransporter() {
    try {
      this.transporter = nodemailer.createTransport(this.smtpConfig);
      this.currentPort = 587;
    } catch (error) {
      console.error('Error creating email transporter with port 587:', error.message);
      this.transporter = null;
    }
  }
  
  /**
   * Try fallback ports in order: 50587, then 465
   */
  tryFallbackPorts() {
    // Try port 50587 first (alternative STARTTLS port)
    if (this.currentPort !== 50587) {
      try {
        this.transporter = nodemailer.createTransport(this.smtpConfigFallback1);
        this.currentPort = 50587;
        console.log('Switched to SMTP port 50587 (alternative STARTTLS)');
        return true;
      } catch (error) {
        console.log('Port 50587 failed, trying port 465...');
      }
    }
    
    // Try port 465 (SSL)
    if (this.currentPort !== 465) {
      try {
        this.transporter = nodemailer.createTransport(this.smtpConfigFallback2);
        this.currentPort = 465;
        console.log('Switched to SMTP port 465 (SSL)');
        return true;
      } catch (error) {
        console.error('All SMTP ports failed:', error.message);
      }
    }
    
    return false;
  }

  /**
   * Check if email service is configured
   */
  isConfigured() {
    return !!this.emailPassword && !!this.transporter;
  }

  /**
   * Verify SMTP connection (for testing)
   */
  async verifyConnection() {
    if (!this.transporter) {
      console.error('Email transporter not initialized');
      return false;
    }
    
    try {
      await this.transporter.verify();
      console.log(`✅ SMTP connection verified (port ${this.currentPort})`);
      return true;
    } catch (error) {
      console.error(`❌ SMTP connection verification failed (port ${this.currentPort}):`, error.message);
      
      // Try fallback ports
      if (this.tryFallbackPorts()) {
        try {
          await this.transporter.verify();
          console.log(`✅ SMTP connection verified (fallback port ${this.currentPort})`);
          return true;
        } catch (fallbackError) {
          console.error(`❌ Fallback SMTP connection (port ${this.currentPort}) also failed:`, fallbackError.message);
          // Try the other fallback if we haven't tried both
          if (this.currentPort === 50587 && this.tryFallbackPorts()) {
            try {
              await this.transporter.verify();
              console.log(`✅ SMTP connection verified (final fallback port ${this.currentPort})`);
              return true;
            } catch (finalError) {
              console.error(`❌ All SMTP ports failed:`, finalError.message);
            }
          }
        }
      }
      
      return false;
    }
  }

  /**
   * Retry function with exponential backoff
   */
  async retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
    let lastError;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries - 1) {
          const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff: 1s, 2s, 4s
          console.log(`Email send attempt ${attempt + 1} failed, retrying in ${delay}ms... (${error.message})`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    throw lastError;
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
   * Send game session notification email with retry logic
   */
  async sendGameSessionNotification(recipientEmail, recipientName, eventData) {
    if (!this.isConfigured()) {
      console.warn('Email service not configured. Skipping email notification.');
      return { success: false, error: 'Email service not configured' };
    }

    const { html, text } = this.generateGameSessionEmailTemplate({
      ...eventData,
      recipientName
    });

    const mailOptions = {
      from: `"PeriodicTableTop" <${this.fromEmail}>`,
      to: recipientEmail,
      subject: `New Game Session: ${eventData.gameName} - ${eventData.groupName}`,
      text: text,
      html: html,
    };

    try {
      // Send with retry logic
      const info = await this.retryWithBackoff(async () => {
        return await this.transporter.sendMail(mailOptions);
      });
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`✅ Email sent to ${recipientEmail} for game session: ${eventData.gameName}`);
        console.log(`   Message ID: ${info.messageId}`);
        console.log(`   Using port: ${this.currentPort}`);
      }
      
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error(`❌ Error sending email to ${recipientEmail}:`, error.message);
      
      // Log detailed error in development
      if (process.env.NODE_ENV === 'development') {
        console.error('SMTP error details:', {
          message: error.message,
          code: error.code,
          command: error.command,
          response: error.response,
          usingPort: this.currentPort
        });
      }
      
      // If connection error, try fallback ports
      if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET') {
        console.log(`Connection error on port ${this.currentPort}, attempting fallback ports...`);
        if (this.tryFallbackPorts()) {
          // Retry send with fallback
          try {
            const info = await this.retryWithBackoff(async () => {
              return await this.transporter.sendMail(mailOptions);
            });
            
            console.log(`✅ Email sent using fallback configuration (port ${this.currentPort})`);
            return { success: true, messageId: info.messageId };
          } catch (fallbackError) {
            console.error(`❌ Fallback SMTP configuration (port ${this.currentPort}) also failed:`, fallbackError.message);
            // Try the other fallback if we haven't tried both
            if (this.currentPort === 50587) {
              if (this.tryFallbackPorts()) {
                try {
                  const info = await this.retryWithBackoff(async () => {
                    return await this.transporter.sendMail(mailOptions);
                  });
                  console.log(`✅ Email sent using final fallback (port ${this.currentPort})`);
                  return { success: true, messageId: info.messageId };
                } catch (finalError) {
                  console.error(`❌ All SMTP ports failed:`, finalError.message);
                }
              }
            }
          }
        }
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
      if (successCount > 0) {
        console.log(`Using SMTP port: ${this.currentPort}`);
      }
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
