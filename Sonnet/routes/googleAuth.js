// routes/googleAuth.js
// Google OAuth 2.0 routes for Calendar integration
const express = require('express');
const { google } = require('googleapis');
const { User } = require('../models');
const router = express.Router();

// Initialize OAuth2 client
const getOAuth2Client = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4000/api/auth/google/callback';
  
  if (!clientId) {
    throw new Error('GOOGLE_CLIENT_ID environment variable is not set');
  }
  
  if (!clientSecret) {
    throw new Error('GOOGLE_CLIENT_SECRET environment variable is not set');
  }
  
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
};

// Helper function to generate Google OAuth URL
const generateGoogleAuthUrl = async (user_id, email = null, username = null, frontendUrl = null) => {
  // Create or find user (auto-create if doesn't exist)
  const [user, created] = await User.findOrCreate({
    where: { user_id },
    defaults: {
      user_id,
      email: email || null,
      username: username || email?.split('@')[0] || 'User',
    }
  });

  // Update user info if provided and user already existed
  if (!created && (email || username)) {
    const updateData = {};
    if (email) updateData.email = email;
    if (username) updateData.username = username;
    await user.update(updateData);
  }

  const oauth2Client = getOAuth2Client();
  
  // Generate authorization URL
  const scopes = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events'
  ];
  
  // Encode state with user_id and frontend URL (so callback knows where to redirect)
  const stateData = {
    user_id: user_id,
    frontend_url: frontendUrl || process.env.FRONTEND_URL || 'http://localhost:3000'
  };
  const state = Buffer.from(JSON.stringify(stateData)).toString('base64');
  
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline', // Required to get refresh token
    scope: scopes,
    prompt: 'consent', // Force consent screen to get refresh token
    state: state, // Pass encoded state with user_id and frontend_url
  });

  return authUrl;
};

// Get Google OAuth URL as JSON (for authenticated API calls)
router.get('/google/url', async (req, res) => {
  try {
    // Use verified user_id from token
    const user_id = req.user?.user_id;
    if (!user_id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Get user info from token (preferred) or query params (fallback for backwards compatibility)
    const email = req.user?.email || req.query.email || null;
    const username = req.user?.name || req.user?.nickname || req.query.username || null;
    
    // Get frontend URL from request origin, query param, or environment variable
    // This ensures the callback redirects to the correct frontend URL
    const frontendUrl = req.query.frontend_url || 
                       (req.headers.origin ? req.headers.origin.replace(/\/$/, '') : null) ||
                       process.env.FRONTEND_URL ||
                       'http://localhost:3000';

    const authUrl = await generateGoogleAuthUrl(user_id, email, username, frontendUrl);
    
    // Return URL as JSON
    res.json({ authUrl });
  } catch (error) {
    console.error('Error generating Google OAuth URL:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Step 1: Redirect user to Google OAuth consent screen (deprecated - use /url endpoint instead)
router.get('/google', async (req, res) => {
  try {
    // Use verified user_id from token
    const user_id = req.user?.user_id;
    if (!user_id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { email, username } = req.query; // Optional, for user creation

    const authUrl = await generateGoogleAuthUrl(user_id, email, username);

    // Redirect to Google
    res.redirect(authUrl);
  } catch (error) {
    console.error('Error initiating Google OAuth:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Step 2: Handle OAuth callback from Google (PUBLIC - no auth required)
router.get('/google/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    
    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }

    if (!state) {
      return res.status(400).json({ error: 'State parameter is required' });
    }

    // Parse state to get user_id and frontend_url
    let user_id;
    let frontendUrl;
    
    try {
      // Try to decode as base64 JSON (new format)
      const decodedState = Buffer.from(state, 'base64').toString('utf-8');
      const stateData = JSON.parse(decodedState);
      user_id = stateData.user_id;
      frontendUrl = stateData.frontend_url;
    } catch (parseError) {
      // Fallback: if state is not JSON, treat it as plain user_id (backwards compatibility)
      user_id = state;
      frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    }

    if (!user_id) {
      return res.status(400).json({ error: 'Invalid state parameter' });
    }

    // Ensure frontend URL has a default
    if (!frontendUrl) {
      frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    }
    
    // Find or create user (should exist from step 1, but create if needed)
    const [user] = await User.findOrCreate({
      where: { user_id },
      defaults: {
        user_id,
        username: 'User',
        email: null,
      }
    });

    const oauth2Client = getOAuth2Client();
    
    // Exchange authorization code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    
    // Store tokens in database
    await user.update({
      google_calendar_token: tokens.access_token,
      google_calendar_refresh_token: tokens.refresh_token,
      google_calendar_enabled: true,
    });

    // Redirect to frontend success page using the frontend URL from state
    res.redirect(`${frontendUrl}/userProfile/?google_calendar=connected`);
  } catch (error) {
    console.error('Error handling Google OAuth callback:', error.message);
    // Try to get frontend URL from state, fallback to env or localhost
    let frontendUrl = 'http://localhost:3000';
    try {
      if (req.query.state) {
        const decodedState = Buffer.from(req.query.state, 'base64').toString('utf-8');
        const stateData = JSON.parse(decodedState);
        frontendUrl = stateData.frontend_url || process.env.FRONTEND_URL || 'http://localhost:3000';
      }
    } catch (e) {
      frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    }
    res.redirect(`${frontendUrl}/userProfile/?google_calendar=error&message=${encodeURIComponent(error.message)}`);
  }
});

// Disconnect Google Calendar
router.post('/google/disconnect', async (req, res) => {
  try {
    // Use verified user_id from token
    const user_id = req.user?.user_id;
    if (!user_id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await User.findOne({ where: { user_id } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Clear Google Calendar tokens
    await user.update({
      google_calendar_token: null,
      google_calendar_refresh_token: null,
      google_calendar_enabled: false,
    });

    res.json({ message: 'Google Calendar disconnected successfully' });
  } catch (error) {
    console.error('Error disconnecting Google Calendar:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get Google Calendar connection status
router.get('/google/status/:user_id', async (req, res) => {
  try {
    // Use verified user_id from token
    const verified_user_id = req.user?.user_id;
    if (!verified_user_id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Verify that the requested user_id matches the authenticated user
    if (req.params.user_id !== verified_user_id) {
      return res.status(403).json({ error: 'Forbidden: Cannot access other users\' calendar status' });
    }
    
    // Find or create user (auto-create if doesn't exist)
    const [user] = await User.findOrCreate({
      where: { user_id: verified_user_id },
      defaults: {
        user_id: verified_user_id,
        username: 'User',
        email: null,
      },
      attributes: ['id', 'google_calendar_enabled']
    });

    res.json({ 
      connected: user.google_calendar_enabled || false 
    });
  } catch (error) {
    console.error('Error getting Google Calendar status:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Refresh Google Calendar token
router.post('/google/refresh', async (req, res) => {
  try {
    // Use verified user_id from token
    const user_id = req.user?.user_id;
    if (!user_id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await User.findOne({ where: { user_id } });
    if (!user || !user.google_calendar_refresh_token) {
      return res.status(404).json({ error: 'User not found or no refresh token available' });
    }

    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials({
      refresh_token: user.google_calendar_refresh_token,
    });

    // Refresh the token
    const { credentials } = await oauth2Client.refreshAccessToken();
    
    // Update stored token
    await user.update({
      google_calendar_token: credentials.access_token,
      // Refresh token might be updated too
      google_calendar_refresh_token: credentials.refresh_token || user.google_calendar_refresh_token,
    });

    res.json({ message: 'Token refreshed successfully' });
  } catch (error) {
    console.error('Error refreshing Google Calendar token:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

