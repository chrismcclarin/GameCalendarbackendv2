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
  // Use URL-safe base64 encoding to avoid issues with special characters in query strings
  const stateData = {
    user_id: user_id,
    frontend_url: frontendUrl || process.env.FRONTEND_URL || 'http://localhost:3000'
  };
  const base64State = Buffer.from(JSON.stringify(stateData)).toString('base64');
  // Make base64 URL-safe by replacing + with -, / with _, and removing padding =
  const state = base64State.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  
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
    
    if (process.env.NODE_ENV !== 'production') {
      console.log('Google OAuth callback received. State:', state ? 'present' : 'missing', 'Code:', code ? 'present' : 'missing');
    }
    
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
      // Decode URL-safe base64: restore +, /, and padding = first
      // Express automatically URL-decodes query params, but we need to restore base64 characters
      const base64State = state.replace(/-/g, '+').replace(/_/g, '/');
      // Add padding if needed (base64 strings should be multiple of 4)
      const padding = base64State.length % 4;
      const paddedState = base64State + (padding ? '='.repeat(4 - padding) : '');
      
      // Decode base64 to get JSON string
      const jsonString = Buffer.from(paddedState, 'base64').toString('utf-8');
      const stateData = JSON.parse(jsonString);
      user_id = stateData.user_id;
      frontendUrl = stateData.frontend_url;
      
      if (process.env.NODE_ENV !== 'production') {
        console.log(`Successfully decoded state. User ID: ${user_id}, Frontend URL: ${frontendUrl}`);
      }
    } catch (parseError) {
      console.warn('Failed to decode state as base64 JSON, trying fallback:', parseError.message);
      if (process.env.NODE_ENV !== 'production') {
        console.warn('State value received:', state);
      }
      // Fallback: if state is not JSON, treat it as plain user_id (backwards compatibility)
      user_id = state;
      frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      if (process.env.NODE_ENV !== 'production') {
        console.log(`Using fallback. User ID: ${user_id}, Frontend URL: ${frontendUrl}`);
      }
    }

    if (!user_id) {
      console.error('No user_id found in state parameter');
      return res.status(400).json({ error: 'Invalid state parameter: missing user_id' });
    }

    // Ensure frontend URL has a default
    if (!frontendUrl) {
      frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    }
    
    if (process.env.NODE_ENV !== 'production') {
      console.log(`Looking up user with ID: ${user_id}`);
    }
    
    // Find or create user (should exist from step 1, but create if needed)
    const [user, created] = await User.findOrCreate({
      where: { user_id },
      defaults: {
        user_id,
        username: 'User',
        email: null,
      }
    });
    
    if (process.env.NODE_ENV !== 'production') {
      console.log(`User found/created: ${created ? 'created' : 'found'}, ID: ${user.id}`);
    }

    const oauth2Client = getOAuth2Client();
    
    // Exchange authorization code for tokens
    if (process.env.NODE_ENV !== 'production') {
      console.log('Exchanging authorization code for tokens...');
    }
    const { tokens } = await oauth2Client.getToken(code);
    
    if (!tokens.access_token) {
      console.error('No access token received from Google');
      throw new Error('Failed to get access token from Google');
    }
    
    if (process.env.NODE_ENV !== 'production') {
      console.log('Tokens received. Access token present:', !!tokens.access_token, 'Refresh token present:', !!tokens.refresh_token);
    }
    
    // Store tokens in database
    await user.update({
      google_calendar_token: tokens.access_token,
      google_calendar_refresh_token: tokens.refresh_token,
      google_calendar_enabled: true,
    });

    // Reload user to verify update
    await user.reload();
    console.log(`Google Calendar connected for user ${user_id}. Enabled: ${user.google_calendar_enabled}, Has Token: ${!!user.google_calendar_token}, Has Refresh Token: ${!!user.google_calendar_refresh_token}`);

    // Redirect to frontend success page using the frontend URL from state
    if (process.env.NODE_ENV !== 'production') {
      console.log(`Redirecting to: ${frontendUrl}/userProfile/?google_calendar=connected`);
    }
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
    
    // Find user (don't auto-create, just return status)
    const user = await User.findOne({
      where: { user_id: verified_user_id },
      attributes: ['id', 'google_calendar_enabled', 'google_calendar_token']
    });

    // If user doesn't exist, they're not connected
    if (!user) {
      return res.json({ connected: false });
    }

    // Check if calendar is enabled AND has a token (both required for "connected")
    const isConnected = !!(user.google_calendar_enabled && user.google_calendar_token);
    
    if (process.env.NODE_ENV !== 'production') {
      console.log(`Google Calendar status for user ${verified_user_id}: enabled=${user.google_calendar_enabled}, hasToken=${!!user.google_calendar_token}, connected=${isConnected}`);
    }
    
    res.json({ 
      connected: isConnected
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

