// routes/feedback.js
const express = require('express');
const router = express.Router();
const { validateFeedback } = require('../middleware/validators');
const emailService = require('../services/emailService');

// Submit bug report or suggestion
router.post('/', validateFeedback, async (req, res) => {
  try {
    const { type, subject, description, user_email, user_id } = req.body;

    const feedbackId = Date.now().toString();
    const timestamp = new Date().toISOString();

    console.log(`Feedback submitted: ${type} - ${subject.substring(0, 50)}${subject.length > 50 ? '...' : ''}`);

    // Send email notification to admin
    const adminEmail = process.env.FEEDBACK_EMAIL;
    if (adminEmail && emailService.isConfigured()) {
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #064e3b; color: white; padding: 16px 20px; border-radius: 6px 6px 0 0;">
            <h2 style="margin: 0;">New Feedback — Next Game Night</h2>
          </div>
          <div style="background-color: #f9fafb; padding: 24px; border-radius: 0 0 6px 6px; border: 1px solid #e5e7eb;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px 0; color: #6b7280; width: 120px;"><strong>Type</strong></td><td style="padding: 8px 0;">${type}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280;"><strong>Subject</strong></td><td style="padding: 8px 0;">${subject}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280;"><strong>From</strong></td><td style="padding: 8px 0;">${user_email || 'Anonymous'}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280;"><strong>Time</strong></td><td style="padding: 8px 0;">${new Date(timestamp).toLocaleString()}</td></tr>
            </table>
            <div style="margin-top: 16px; padding: 16px; background: white; border-radius: 4px; border-left: 4px solid #d97706;">
              <strong style="color: #6b7280;">Description</strong>
              <p style="margin: 8px 0 0; color: #111827;">${description}</p>
            </div>
          </div>
        </div>
      `.trim();

      const text = `New Feedback — Next Game Night\n\nType: ${type}\nSubject: ${subject}\nFrom: ${user_email || 'Anonymous'}\nTime: ${new Date(timestamp).toLocaleString()}\n\n${description}`;

      await emailService.send({
        to: adminEmail,
        subject: `[Feedback] ${type}: ${subject}`,
        html,
        text,
        ...(user_email && { replyTo: user_email }),
      });
    }

    res.json({
      message: 'Thank you for your feedback! We appreciate your input.',
      feedback_id: feedbackId,
    });
  } catch (error) {
    console.error('Error submitting feedback:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

