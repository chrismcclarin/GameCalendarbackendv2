// routes/users.js
const express = require('express');
const { User, Group, UserGroup } = require('../models');
const router = express.Router();
const { validateUserSearch } = require('../middleware/validators');

// Search user by email
router.get('/search/email/:email', validateUserSearch, async (req, res) => {
  try {
    const user = await User.findOne({
      where: { email: req.params.email }
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user by user_id (auto-creates if doesn't exist and user is authenticated)
router.get('/:user_id', async (req, res) => {
  try {
    let user = await User.findOne({
      where: { user_id: req.params.user_id },
      include: [{ model: Group }]
    });
    
    // If user doesn't exist but we have authenticated user info, auto-create
    if (!user && req.user && req.user.user_id === req.params.user_id) {
      // Use Auth0 token info to create user
      // For Google sign-in, email should be available in the token
      const userEmail = req.user.email;
      if (!userEmail) {
        console.warn(`No email found in token for user ${req.params.user_id}. Available fields:`, {
          name: req.user.name,
          nickname: req.user.nickname,
          given_name: req.user.given_name,
          family_name: req.user.family_name,
        });
      }
      
      // Email is required, so use a valid email format if not provided
      // This should rarely happen with Google sign-in
      const finalEmail = userEmail || `${req.params.user_id.replace(/[|:]/g, '-')}@auth0.local`;
      const userName = req.user.name || req.user.nickname || req.user.given_name || req.user.email?.split('@')[0] || 'User';
      
      try {
        const [newUser, created] = await User.findOrCreate({
          where: { user_id: req.params.user_id },
          defaults: {
            user_id: req.params.user_id,
            email: finalEmail,
            username: userName,
          }
        });
        user = newUser;
        
        if (created) {
          console.log(`Auto-created user: ${user.user_id} (${user.username}) with email: ${user.email}`);
        }
      } catch (error) {
        // If creation fails (e.g., email already exists), try to find the user
        console.error('Error auto-creating user:', error.message);
        user = await User.findOne({ where: { user_id: req.params.user_id } });
        if (!user) {
          throw error; // Re-throw if we still can't find/create the user
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

module.exports = router;