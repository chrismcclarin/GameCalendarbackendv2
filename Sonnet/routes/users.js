// routes/users.js
const express = require('express');
const { User, Group, UserGroup } = require('../models');
const router = express.Router();
const { validateUserSearch } = require('../middleware/validators');
const auth0Service = require('../services/auth0Service');

// Search user by email
// Searches both our database and Auth0
router.get('/search/email/:email', validateUserSearch, async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email);
    
    // First, search in our database
    let user = await User.findOne({
      where: { email: email }
    });
    
    // If not found in database, try to find in Auth0 Management API
    // SECURITY: We ONLY create users if they exist in Auth0 (verified by Management API search)
    // We never create users "from thin air" - they must exist in Auth0 first
    if (!user) {
      try {
        const auth0Users = await auth0Service.searchUsersByEmail(email);
        
        // Only create user if found in Auth0
        if (auth0Users && auth0Users.length > 0) {
          // Found in Auth0, safe to create user in our database
          const auth0User = auth0Users[0]; // Use first match
          const userDetails = auth0Service.extractUserDetails(auth0User);
          
          // Create user in our database (they exist in Auth0, so this is safe)
          const [newUser, created] = await User.findOrCreate({
            where: { user_id: userDetails.user_id },
            defaults: {
              user_id: userDetails.user_id,
              email: userDetails.email,
              username: userDetails.username, // This includes the username they entered during signup
            }
          });
          
          // If user already existed but had wrong email, update it
          if (!created && newUser.email !== userDetails.email) {
            await newUser.update({
              email: userDetails.email,
              username: userDetails.username
            });
          }
          
          user = newUser;
        }
        // If not found in Auth0, user doesn't exist - return 404 (don't create from thin air)
      } catch (auth0Error) {
        // If Auth0 Management API is not configured, log and continue
        // This allows the endpoint to work even without Management API (but won't find users who haven't logged in yet)
        console.warn('Auth0 Management API lookup failed (this is optional):', auth0Error.message);
        // Continue to return 404 below (user not found)
      }
    }
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user by user_id (auto-creates if doesn't exist and user is authenticated)
// SECURITY: We only create users if:
// 1. They have a valid Auth0 token (verified by verifyAuth0Token middleware)
// 2. The token's user_id matches the requested user_id
// This ensures the user MUST exist in Auth0 before we create them in our database
router.get('/:user_id', async (req, res) => {
  try {
    let user = await User.findOne({
      where: { user_id: req.params.user_id },
      include: [{ model: Group }]
    });
    
    // Only auto-create if:
    // 1. User doesn't exist in our database
    // 2. Request has authenticated user info (valid Auth0 token)
    // 3. The authenticated user_id matches the requested user_id
    // SECURITY: The verifyAuth0Token middleware ensures they exist in Auth0 (token is signed by Auth0)
    // A valid Auth0 token can ONLY be issued by Auth0, which means the user MUST exist in Auth0
    // Therefore, we can safely create them in our database
    if (!user && req.user && req.user.user_id === req.params.user_id) {
      // Start with username from token (for email/password users, this is what they entered during signup)
      let userName = req.user.username || req.user.name || req.user.nickname || req.user.given_name || req.user.email?.split('@')[0] || 'User';
      let userEmail = req.user.email;
      
      // ALWAYS try to fetch from Auth0 Management API if we have credentials
      // This ensures we get the username they entered during signup (for email/password users)
      // Even if email is in token, username might not be, so we need Management API
      try {
        const auth0User = await auth0Service.getUserById(req.params.user_id);
        if (auth0User) {
          // User exists in Auth0 (verified), safe to use their details
          const userDetails = auth0Service.extractUserDetails(auth0User);
          
          // Always use email from Management API if available and valid
          if (userDetails.email && !userDetails.email.includes('@auth0.local') && !userDetails.email.includes('@auth0')) {
            userEmail = userDetails.email;
          }
          
          // Always use username from Management API if available and not generic
          // This is critical for email/password users who entered a username during signup
          if (userDetails.username && userDetails.username.trim().length > 0 && userDetails.username !== 'User') {
            userName = userDetails.username.trim();
          }
        }
      } catch (auth0Error) {
        // If Management API is not configured or fails, log and continue with token data
        // This allows the system to work without Management API (with reduced functionality)
        console.warn('Auth0 Management API lookup failed during user creation (this is optional):', auth0Error.message);
        if (process.env.NODE_ENV === 'development') {
          console.log('Falling back to token data. Make sure AUTH0_MANAGEMENT_CLIENT_ID and AUTH0_MANAGEMENT_CLIENT_SECRET are set for full functionality.');
        }
      }
      
      // Improve username extraction for email/password users
      if (!userEmail || userEmail.includes('@auth0.local') || userEmail.includes('@auth0')) {
        // Fallback: construct email from user_id if still missing
        userEmail = `${req.params.user_id.replace(/[|:]/g, '-')}@auth0.local`;
      }
      
      // If username is still generic, try to extract from email
      if (userName === 'User' && userEmail && !userEmail.includes('@auth0.local') && !userEmail.includes('@auth0')) {
        userName = userEmail.split('@')[0];
      }
      
      // Combine given_name and family_name if available
      if (req.user.given_name || req.user.family_name) {
        const fullName = [req.user.given_name, req.user.family_name].filter(Boolean).join(' ').trim();
        if (fullName) {
          userName = fullName;
        }
      }
      
      try {
        const [newUser, created] = await User.findOrCreate({
          where: { user_id: req.params.user_id },
          defaults: {
            user_id: req.params.user_id,
            email: userEmail,
            username: userName,
          }
        });
        
        // If user already existed but has wrong email/username, update them
        if (!created) {
          const needsUpdate = 
            (newUser.email !== userEmail && !newUser.email.includes('@auth0.local') && !newUser.email.includes('@auth0')) ||
            (newUser.username === 'User' && userName !== 'User');
          
          if (needsUpdate) {
            await newUser.update({
              email: userEmail,
              username: userName
            });
            console.log(`Updated user ${newUser.user_id} with email: ${userEmail}, username: ${userName}`);
          }
        } else {
          console.log(`Auto-created user: ${newUser.user_id} (${newUser.username}) with email: ${newUser.email}`);
        }
        
        user = newUser;
      } catch (error) {
        // If creation fails (e.g., email already exists), try to find the user
        console.error('Error auto-creating user:', error.message);
        user = await User.findOne({ where: { user_id: req.params.user_id } });
        if (!user) {
          throw error; // Re-throw if we still can't find/create the user
        }
      }
    }
    
    // If user exists but has incorrect email/username, try to fix it
    // This handles cases where users were created before we had proper email extraction
    if (user && req.user && req.user.user_id === req.params.user_id) {
      const hasIncorrectEmail = user.email && (user.email.includes('@auth0.local') || user.email.includes('@auth0'));
      const hasGenericUsername = user.username === 'User' || !user.username || user.username.trim().length === 0;
      
      if (hasIncorrectEmail || hasGenericUsername) {
        // ALWAYS try Auth0 Management API to get correct data
        // This is especially important for email/password users with username from signup
        try {
          const auth0User = await auth0Service.getUserById(req.params.user_id);
          if (auth0User) {
            const userDetails = auth0Service.extractUserDetails(auth0User);
            
            const updateData = {};
            
            // Update email if incorrect
            if (hasIncorrectEmail && userDetails.email && !userDetails.email.includes('@auth0.local') && !userDetails.email.includes('@auth0')) {
              updateData.email = userDetails.email;
            }
            
            // Update username if generic or missing
            if (hasGenericUsername && userDetails.username && userDetails.username.trim().length > 0 && userDetails.username !== 'User') {
              updateData.username = userDetails.username.trim();
            }
            
            if (Object.keys(updateData).length > 0) {
              await user.update(updateData);
              console.log(`Fixed user ${user.user_id} with Management API data:`, updateData);
              // Reload user to get updated data
              user = await User.findOne({
                where: { user_id: req.params.user_id },
                include: [{ model: Group }]
              });
            }
          }
        } catch (auth0Error) {
          // If Management API fails, log but don't break
          console.warn('Auth0 Management API lookup failed during user update:', auth0Error.message);
          if (process.env.NODE_ENV === 'development') {
            console.log('Make sure AUTH0_MANAGEMENT_CLIENT_ID and AUTH0_MANAGEMENT_CLIENT_SECRET are set.');
          }
        }
      }
    }
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create or update user
router.post('/', async (req, res) => {
  try {
    const { username, email, user_id } = req.body;
    
    const [user, created] = await User.findOrCreate({
      where: { user_id },
      defaults: { username, email, user_id }
    });
    
    if (!created) {
      await user.update({ username, email });
    }
    
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update user's username
router.put('/:user_id/username', async (req, res) => {
  try {
    // Use verified user_id from token
    const verified_user_id = req.user?.user_id;
    if (!verified_user_id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Verify that the requested user_id matches the authenticated user
    if (req.params.user_id !== verified_user_id) {
      return res.status(403).json({ error: 'Forbidden: Cannot update other users\' usernames' });
    }
    
    const { username } = req.body;
    
    if (!username || typeof username !== 'string' || username.trim().length === 0) {
      return res.status(400).json({ error: 'Username is required and must be a non-empty string' });
    }
    
    if (username.length > 50) {
      return res.status(400).json({ error: 'Username must be 50 characters or less' });
    }
    
    const user = await User.findOne({ where: { user_id: verified_user_id } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    await user.update({ username: username.trim() });
    
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Refresh user info from Auth0 (updates email and username from Auth0)
router.post('/:user_id/refresh', async (req, res) => {
  try {
    // Use verified user_id from token
    const verified_user_id = req.user?.user_id;
    if (!verified_user_id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Verify that the requested user_id matches the authenticated user
    if (req.params.user_id !== verified_user_id) {
      return res.status(403).json({ error: 'Forbidden: Cannot refresh other users\' info' });
    }
    
    let user = await User.findOne({ where: { user_id: verified_user_id } });
    
    try {
      // Fetch latest info from Auth0 Management API
      const auth0User = await auth0Service.getUserById(verified_user_id);
      if (!auth0User) {
        return res.status(404).json({ error: 'User not found in Auth0' });
      }
      
      const userDetails = auth0Service.extractUserDetails(auth0User);
      
      if (!user) {
        // Create user if doesn't exist
        user = await User.create({
          user_id: userDetails.user_id,
          email: userDetails.email,
          username: userDetails.username,
        });
      } else {
        // Update existing user with correct info
        await user.update({
          email: userDetails.email,
          username: userDetails.username,
        });
      }
      
      res.json(user);
    } catch (auth0Error) {
      if (!user) {
        return res.status(404).json({ error: 'User not found and could not fetch from Auth0' });
      }
      // If Auth0 fails but user exists, return current user
      res.json(user);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;