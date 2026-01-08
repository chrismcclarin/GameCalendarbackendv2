// routes/groups.js
const express = require('express');
const { Group, User, UserGroup, Event, Game, EventParticipation, GameReview } = require('../models');
const { Op } = require('sequelize');
const router = express.Router();
const { validateGroupCreate, validateGroupUpdate, validateUUID } = require('../middleware/validators');

// Helper function to get user's role in a group
const getUserRoleInGroup = async (user_id, group_id) => {
  const user = await User.findOne({ where: { user_id } });
  if (!user) return null;
  
  const userGroup = await UserGroup.findOne({
    where: {
      user_id: user.id,
      group_id: group_id
    }
  });
  
  return userGroup ? userGroup.role : null;
};

// Helper function to check if user is owner or admin
const isOwnerOrAdmin = async (user_id, group_id) => {
  const role = await getUserRoleInGroup(user_id, group_id);
  return role === 'owner' || role === 'admin';
};

// Helper function to check if user is owner
const isOwner = async (user_id, group_id) => {
  const role = await getUserRoleInGroup(user_id, group_id);
  return role === 'owner';
};

// Get all groups for a user
// user_id is now extracted from verified JWT token (req.user.user_id)
router.get('/user/:user_id', async (req, res) => {
  try {
    // Use verified user_id from token, not from params
    const verified_user_id = req.user?.user_id;
    if (!verified_user_id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Verify that the requested user_id matches the authenticated user
    if (req.params.user_id !== verified_user_id) {
      return res.status(403).json({ error: 'Forbidden: Cannot access other users\' groups' });
    }
    
    let user = await User.findOne({
      where: { user_id: verified_user_id }
    });
    
    // If user doesn't exist, auto-create using Auth0 token info
    if (!user) {
      // For Google sign-in, email should be available in the token
      const userEmail = req.user.email;
      if (!userEmail) {
        console.warn(`No email found in token for user ${verified_user_id}. Available fields:`, {
          name: req.user.name,
          nickname: req.user.nickname,
          given_name: req.user.given_name,
          family_name: req.user.family_name,
        });
      }
      
      // Email is required, so use a valid email format if not provided
      // This should rarely happen with Google sign-in
      const finalEmail = userEmail || `${verified_user_id.replace(/[|:]/g, '-')}@auth0.local`;
      const userName = req.user.name || req.user.nickname || req.user.given_name || req.user.email?.split('@')[0] || 'User';
      
      try {
        const [newUser, created] = await User.findOrCreate({
          where: { user_id: verified_user_id },
          defaults: {
            user_id: verified_user_id,
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
        user = await User.findOne({ where: { user_id: verified_user_id } });
        if (!user) {
          throw error; // Re-throw if we still can't find/create the user
        }
      }
    }
    
    // Get all groups for this user using UserGroup join
    const { UserGroup } = require('../models');
    const userGroups = await UserGroup.findAll({
      where: { user_id: user.id },
      attributes: ['group_id']
    });
    
    const groupIds = userGroups.map(ug => ug.group_id);
    
    // Get all groups with their members and recent events
    const groups = await Group.findAll({
      where: { id: groupIds },
      include: [
        {
          model: User,
          attributes: ['id', 'username', 'user_id', 'email'],
          through: { attributes: ['role', 'joined_at'] }
        },
        {
          model: Event,
          limit: 1,
          order: [['createdAt', 'DESC']],
          include: [{
            model: Game,
            attributes: ['name', 'image_url', 'theme']
          }]
        }
      ]
    });
    
    res.json(groups);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new group
router.post('/', validateGroupCreate, async (req, res) => {
  try {
    // Use verified user_id from token
    const user_id = req.user?.user_id;
    if (!user_id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { name } = req.body;
    
    const user = await User.findOne({ where: { user_id } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const group = await Group.create({
      name,
      group_id: `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    });
    
    // Creator is set as 'owner'
    await UserGroup.create({
      user_id: user.id,
      group_id: group.id,
      role: 'owner'
    });
    
    res.json(group);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get a single group by ID
router.get('/:group_id', validateUUID('group_id'), async (req, res) => {
  try {
    const group = await Group.findByPk(req.params.group_id);
    
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    res.json(group);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all users in a group
router.get('/:group_id/users', async (req, res) => {
  try {
    const group = await Group.findByPk(req.params.group_id, {
      include: [{
        model: User,
        attributes: ['id', 'username', 'user_id', 'email'],
        through: { attributes: ['role', 'joined_at'] }
      }]
    });
    
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    res.json(group.Users || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add user to group
router.post('/:group_id/users', async (req, res) => {
  try {
    const { user_id } = req.body;
    
    const user = await User.findOne({ where: { user_id } });
    const group = await Group.findByPk(req.params.group_id);
    
    if (!user || !group) {
      return res.status(404).json({ error: 'User or Group not found' });
    }
    
    await UserGroup.findOrCreate({
      where: {
        user_id: user.id,
        group_id: group.id
      },
      defaults: {
        user_id: user.id,
        group_id: group.id,
        role: 'member'
      }
    });
    
    res.json({ message: 'User added to group successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update user role in group (only owner can do this)
router.put('/:group_id/users/:target_user_id/role', async (req, res) => {
  try {
    // Use verified user_id from token
    const requesting_user_id = req.user?.user_id;
    if (!requesting_user_id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { group_id, target_user_id } = req.params; // Target user to update
    const { role } = req.body; // New role: 'member', 'admin', or 'owner'
    
    // Only owner can change roles
    const requestingUser = await User.findOne({ where: { user_id: requesting_user_id } });
    if (!requestingUser) {
      return res.status(404).json({ error: 'Requesting user not found' });
    }
    
    const isRequestingOwner = await isOwner(requesting_user_id, group_id);
    if (!isRequestingOwner) {
      return res.status(403).json({ error: 'Only the group owner can change user roles' });
    }
    
    // Validate role
    if (!['member', 'admin', 'owner'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be member, admin, or owner' });
    }
    
    // Prevent changing owner's role (owner can't demote themselves)
    const targetUser = await User.findOne({ where: { user_id: target_user_id } });
    if (!targetUser) {
      return res.status(404).json({ error: 'Target user not found' });
    }
    
    const targetUserGroup = await UserGroup.findOne({
      where: {
        user_id: targetUser.id,
        group_id: group_id
      }
    });
    
    if (!targetUserGroup) {
      return res.status(404).json({ error: 'User is not a member of this group' });
    }
    
    // If trying to change own role and they're the owner, don't allow demotion
    if (requestingUser.id === targetUser.id && targetUserGroup.role === 'owner' && role !== 'owner') {
      return res.status(400).json({ error: 'Group owner cannot change their own role' });
    }
    
    // Update the role
    await targetUserGroup.update({ role });
    
    res.json({ message: 'User role updated successfully', role });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete group - owner only (must come before /:group_id/users/:target_user_id)
router.delete('/:group_id', async (req, res) => {
  try {
    // Use verified user_id from token
    const requesting_user_id = req.user?.user_id;
    if (!requesting_user_id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { group_id } = req.params;
    
    // Check if user is owner
    const hasPermission = await isOwner(requesting_user_id, group_id);
    if (!hasPermission) {
      return res.status(403).json({ error: 'Only the group owner can delete the group' });
    }
    
    const group = await Group.findByPk(group_id);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    // Delete all event participations for events in this group
    const events = await Event.findAll({ where: { group_id } });
    const eventIds = events.map(e => e.id);
    if (eventIds.length > 0) {
      await EventParticipation.destroy({ where: { event_id: { [Op.in]: eventIds } } });
    }
    
    // Delete all events for this group
    await Event.destroy({ where: { group_id } });
    
    // Delete all game reviews for this group
    await GameReview.destroy({ where: { group_id } });
    
    // Delete all user-group associations
    await UserGroup.destroy({ where: { group_id } });
    
    // Finally, delete the group
    await group.destroy();
    
    res.json({ message: 'Group deleted successfully' });
  } catch (error) {
    console.error('Error deleting group:', error);
    res.status(500).json({ error: error.message });
  }
});

// Remove user from group (owner or admin can do this, but owner can't remove themselves)
router.delete('/:group_id/users/:target_user_id', async (req, res) => {
  try {
    // Use verified user_id from token
    const requesting_user_id = req.user?.user_id;
    if (!requesting_user_id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { group_id, target_user_id } = req.params; // Target user to remove
    
    const requestingUser = await User.findOne({ where: { user_id: requesting_user_id } });
    const targetUser = await User.findOne({ where: { user_id: target_user_id } });
    
    if (!requestingUser || !targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Only owner or admin can remove users
    const hasPermission = await isOwnerOrAdmin(requesting_user_id, group_id);
    if (!hasPermission) {
      return res.status(403).json({ error: 'Only owners and admins can remove users from groups' });
    }
    
    // Owner cannot remove themselves (they must transfer ownership first or delete the group)
    if (requesting_user_id === target_user_id) {
      const requestingRole = await getUserRoleInGroup(requesting_user_id, group_id);
      if (requestingRole === 'owner') {
        return res.status(400).json({ error: 'Group owner cannot remove themselves. Transfer ownership first or delete the group.' });
      }
    }
    
    const targetUserGroup = await UserGroup.findOne({
      where: {
        user_id: targetUser.id,
        group_id: group_id
      }
    });
    
    if (!targetUserGroup) {
      return res.status(404).json({ error: 'User is not a member of this group' });
    }
    
    await targetUserGroup.destroy();
    
    res.json({ message: 'User removed from group successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update group settings (profile picture, background) - owner or admin only
router.put('/:group_id/settings', validateUUID('group_id'), validateGroupUpdate, async (req, res) => {
  try {
    // Use verified user_id from token
    const requesting_user_id = req.user?.user_id;
    if (!requesting_user_id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { profile_picture_url, background_color, background_image_url } = req.body;
    const { group_id } = req.params;
    
    // Check if user has permission (owner or admin)
    const hasPermission = await isOwnerOrAdmin(requesting_user_id, group_id);
    if (!hasPermission) {
      return res.status(403).json({ error: 'Only owners and admins can update group settings' });
    }
    
    const group = await Group.findByPk(group_id);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    // Update only provided fields
    const updateData = {};
    if (profile_picture_url !== undefined) updateData.profile_picture_url = profile_picture_url;
    if (background_color !== undefined) updateData.background_color = background_color;
    if (background_image_url !== undefined) updateData.background_image_url = background_image_url;
    
    await group.update(updateData);
    
    res.json(group);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;