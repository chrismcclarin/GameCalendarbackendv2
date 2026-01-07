// routes/feedback.js
const express = require('express');
const router = express.Router();
const { validateFeedback } = require('../middleware/validators');

// Store feedback in memory (in production, you'd want to use a database or email service)
// For now, we'll just log it and return success
const feedbackLog = [];

// Submit bug report or suggestion
router.post('/', validateFeedback, async (req, res) => {
  try {
    const { type, subject, description, user_email, user_id } = req.body;
    
    const feedback = {
      id: Date.now().toString(),
      type,
      subject,
      description,
      user_email: user_email || null,
      user_id: user_id || null,
      timestamp: new Date().toISOString(),
    };
    
    // Log the feedback (in production, save to database or send email)
    feedbackLog.push(feedback);
    // Sanitized logging - don't expose user email or ID
    if (process.env.NODE_ENV === 'development') {
      console.log('=== FEEDBACK SUBMISSION ===');
      console.log('Type:', type);
      console.log('Subject:', subject);
      console.log('Description:', description);
      console.log('User ID provided:', user_id ? 'Yes' : 'No');
      console.log('Timestamp:', feedback.timestamp);
      console.log('==========================');
    } else {
      // Production logging - minimal info
      console.log(`Feedback submitted: ${type} - ${subject.substring(0, 50)}${subject.length > 50 ? '...' : ''}`);
    }
    
    // In production, you might want to:
    // 1. Save to database
    // 2. Send email notification
    // 3. Create a ticket in a bug tracking system
    
    res.json({ 
      message: 'Thank you for your feedback! We appreciate your input.',
      feedback_id: feedback.id
    });
  } catch (error) {
    console.error('Error submitting feedback:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all feedback (for admin use - in production, add authentication)
// SECURITY: This endpoint should be protected in production
// For now, only allow in development mode
router.get('/', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'This endpoint is not available in production' });
  }
  res.json(feedbackLog);
});

module.exports = router;

