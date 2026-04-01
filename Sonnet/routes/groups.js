// routes/groups.js
const express = require('express');
const crypto = require('crypto');
const { Group, User, UserGroup, Event, Game, EventParticipation, GameReview, UserGame } = require('../models');
const { Op } = require('sequelize');
const router = express.Router();
const { validateGroupCreate, validateGroupUpdate, validateUUID } = require('../middleware/validators');
const { getUserRoleInGroup, isOwnerOrAdmin, isOwner, isActiveMember } = require('../services/authorizationService');

// Get all groups for a user
// user_id is now extracted from verified JWT token (req.user.user_id)
router.get('/user/:user_id', async (req, res) => {
  try {
    // Use verified user_id from token, not from params
    const userId = req.user?.user_id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Verify that the requested user_id matches the authenticated user
    if (req.params.user_id !== userId) {
      return res.status(403).json({ error: 'Forbidden: Cannot access other users\' groups' });
    }

    let user = await User.findOne({
      where: { user_id: userId }
    });

    // If user doesn't exist, auto-create using Auth0 token info
    if (!user) {
      // For Google sign-in, email should be available in the token
      const userEmail = req.user.email;
      if (!userEmail) {
        console.warn(`No email found in token for user ${userId}. Available fields:`, {
          name: req.user.name,
          nickname: req.user.nickname,
          given_name: req.user.given_name,
          family_name: req.user.family_name,
        });
      }

      // Email is required, so use a valid email format if not provided
      // This should rarely happen with Google sign-in
      const finalEmail = userEmail || `${userId.replace(/[|:]/g, '-')}@auth0.local`;
      const userName = req.user.name || req.user.nickname || req.user.given_name || req.user.email?.split('@')[0] || 'User';

      try {
        const [newUser, created] = await User.findOrCreate({
          where: { user_id: userId },
          defaults: {
            user_id: userId,
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
        user = await User.findOne({ where: { user_id: userId } });
        if (!user) {
          throw error; // Re-throw if we still can't find/create the user
        }
      }
    }
    
    // Get all groups for this user using UserGroup join
    const userGroups = await UserGroup.findAll({
      where: { user_id: user.user_id, status: 'active' }, // Use user.user_id (Auth0 string) not user.id (UUID)
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
          through: { where: { status: 'active' }, attributes: ['role', 'joined_at'] }
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
    const userId = req.user?.user_id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { name } = req.body;

    const user = await User.findOne({ where: { user_id: userId } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const group = await Group.create({
      name,
      group_id: `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    });
    
    // Creator is set as 'owner'
    await UserGroup.create({
      user_id: user.user_id, // Use user.user_id (Auth0 string) not user.id (UUID)
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
        through: { where: { status: 'active' }, attributes: ['role', 'joined_at'] }
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
        user_id: user.user_id, // Use user.user_id (Auth0 string) not user.id (UUID)
        group_id: group.id
      },
      defaults: {
        user_id: user.user_id, // Use user.user_id (Auth0 string) not user.id (UUID)
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
    const userId = req.user?.user_id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { group_id, target_user_id } = req.params; // Target user to update
    const { role } = req.body; // New role: 'member', 'admin', or 'owner'
    
    // Only owner can change roles
    const requestingUser = await User.findOne({ where: { user_id: userId } });
    if (!requestingUser) {
      return res.status(404).json({ error: 'Requesting user not found' });
    }
    
    const isRequestingOwner = await isOwner(userId, group_id);
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
        user_id: targetUser.user_id, // Use targetUser.user_id (Auth0 string) not targetUser.id (UUID)
        group_id: group_id,
        status: 'active'
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

// Get (or lazily generate) the group's invite token
router.get('/:group_id/invite-token', async (req, res) => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { group_id } = req.params;

    // Any active member can view/share the QR invite
    const hasAccess = await isActiveMember(userId, group_id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const group = await Group.findByPk(group_id);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Lazily generate invite token if not set
    if (!group.invite_token) {
      group.invite_token = crypto.randomBytes(32).toString('hex');
      await group.save();
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.json({
      invite_token: group.invite_token,
      invite_url: `${frontendUrl}/invite/group/${group.invite_token}`,
    });
  } catch (error) {
    console.error('Error getting group invite token:', error);
    res.status(500).json({ error: error.message });
  }
});

// Regenerate the group's invite token (owner/admin only)
router.post('/:group_id/reset-invite-token', async (req, res) => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { group_id } = req.params;

    const hasPermission = await isOwnerOrAdmin(userId, group_id);
    if (!hasPermission) {
      return res.status(403).json({ error: 'Only owners and admins can reset the invite token' });
    }

    const group = await Group.findByPk(group_id);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    group.invite_token = crypto.randomBytes(32).toString('hex');
    await group.save();

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.json({
      invite_token: group.invite_token,
      invite_url: `${frontendUrl}/invite/group/${group.invite_token}`,
    });
  } catch (error) {
    console.error('Error resetting group invite token:', error);
    res.status(500).json({ error: error.message });
  }
});

// Public: preview group info from invite token (no auth required)
router.get('/invite-preview/:token', async (req, res) => {
  try {
    const group = await Group.findOne({
      where: { invite_token: req.params.token },
    });

    if (!group) {
      return res.status(404).json({ error: 'Invalid invite link' });
    }

    // Count active members
    const memberCount = await UserGroup.count({
      where: { group_id: group.id, status: 'active' },
    });

    res.json({
      group_name: group.name,
      group_description: group.description || null,
      member_count: memberCount,
      group_id: group.id,
    });
  } catch (error) {
    console.error('Error getting group invite preview:', error);
    res.status(500).json({ error: error.message });
  }
});

// Join a group by invite token (authenticated)
router.post('/join-by-token', async (req, res) => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const group = await Group.findOne({
      where: { invite_token: token },
    });

    if (!group) {
      return res.status(404).json({ error: 'Invalid invite link' });
    }

    // Check for existing UserGroup
    const existingMembership = await UserGroup.findOne({
      where: { user_id: userId, group_id: group.id },
    });

    if (existingMembership) {
      // Already an active member
      if (existingMembership.status === 'active' && existingMembership.role !== 'pending') {
        return res.json({ already_member: true, group_id: group.id });
      }

      // Re-activate declined or pending membership as full member
      await existingMembership.update({
        role: 'member',
        status: 'active',
        joined_at: new Date(),
      });

      return res.json({ success: true, group_id: group.id });
    }

    // Create new membership -- CRITICAL: role is 'member' NOT 'pending' (QR invites bypass pending)
    await UserGroup.create({
      user_id: userId,
      group_id: group.id,
      role: 'member',
      status: 'active',
      joined_at: new Date(),
    });

    res.json({ success: true, group_id: group.id });
  } catch (error) {
    console.error('Error joining group by token:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete group - owner only (must come before /:group_id/users/:target_user_id)
router.delete('/:group_id', async (req, res) => {
  try {
    // Use verified user_id from token
    const userId = req.user?.user_id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { group_id } = req.params;
    
    // Check if user is owner
    const hasPermission = await isOwner(userId, group_id);
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

// Approve a pending member (owner/admin only)
router.post('/:group_id/users/:target_user_id/approve', async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { group_id, target_user_id } = req.params;

    const hasPermission = await isOwnerOrAdmin(userId, group_id);
    if (!hasPermission) {
      return res.status(403).json({ error: 'Only owners and admins can approve members' });
    }

    const decodedTargetId = decodeURIComponent(target_user_id);
    const targetUserGroup = await UserGroup.findOne({
      where: {
        user_id: decodedTargetId,
        group_id: group_id,
        status: 'active',
        role: 'pending',
      },
    });

    if (!targetUserGroup) {
      return res.status(404).json({ error: 'Pending member not found' });
    }

    await targetUserGroup.update({ role: 'member' });

    res.json({ success: true, message: 'Member approved' });
  } catch (error) {
    console.error('Error approving member:', error);
    res.status(500).json({ error: error.message });
  }
});

// Reject a pending member (owner/admin only)
router.post('/:group_id/users/:target_user_id/reject', async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { group_id, target_user_id } = req.params;

    const hasPermission = await isOwnerOrAdmin(userId, group_id);
    if (!hasPermission) {
      return res.status(403).json({ error: 'Only owners and admins can reject members' });
    }

    const decodedTargetId = decodeURIComponent(target_user_id);
    const targetUserGroup = await UserGroup.findOne({
      where: {
        user_id: decodedTargetId,
        group_id: group_id,
        status: 'active',
        role: 'pending',
      },
    });

    if (!targetUserGroup) {
      return res.status(404).json({ error: 'Pending member not found' });
    }

    await targetUserGroup.destroy();

    res.json({ success: true, message: 'Member rejected and removed from group' });
  } catch (error) {
    console.error('Error rejecting member:', error);
    res.status(500).json({ error: error.message });
  }
});

// Leave a group voluntarily (any non-owner member)
router.post('/:group_id/leave', async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { group_id } = req.params;

    const userGroup = await UserGroup.findOne({
      where: {
        user_id: userId,
        group_id: group_id,
        status: 'active',
      },
    });

    if (!userGroup) {
      return res.status(404).json({ error: 'You are not a member of this group' });
    }

    if (userGroup.role === 'owner') {
      return res.status(403).json({ error: 'Group owner cannot leave. Transfer ownership or delete the group.' });
    }

    await userGroup.destroy();

    res.json({ success: true, message: 'You have left the group' });
  } catch (error) {
    console.error('Error leaving group:', error);
    res.status(500).json({ error: error.message });
  }
});

// Remove user from group (owner or admin can do this, but owner can't remove themselves)
router.delete('/:group_id/users/:target_user_id', async (req, res) => {
  try {
    // Use verified user_id from token
    const userId = req.user?.user_id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { group_id, target_user_id } = req.params; // Target user to remove
    
    const requestingUser = await User.findOne({ where: { user_id: userId } });
    const targetUser = await User.findOne({ where: { user_id: target_user_id } });
    
    if (!requestingUser || !targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Only owner or admin can remove users
    const hasPermission = await isOwnerOrAdmin(userId, group_id);
    if (!hasPermission) {
      return res.status(403).json({ error: 'Only owners and admins can remove users from groups' });
    }
    
    // Owner cannot remove themselves (they must transfer ownership first or delete the group)
    if (userId === target_user_id) {
      const requestingRole = await getUserRoleInGroup(userId, group_id);
      if (requestingRole === 'owner') {
        return res.status(400).json({ error: 'Group owner cannot remove themselves. Transfer ownership first or delete the group.' });
      }
    }
    
    const targetUserGroup = await UserGroup.findOne({
      where: {
        user_id: targetUser.user_id, // Use targetUser.user_id (Auth0 string) not targetUser.id (UUID)
        group_id: group_id,
        status: 'active'
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
    const userId = req.user?.user_id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { profile_picture_url, background_color, background_image_url } = req.body;
    const { group_id } = req.params;
    
    // Check if user has permission (owner or admin)
    const hasPermission = await isOwnerOrAdmin(userId, group_id);
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

// Get the group's shared game library (all confirmed members' games, deduplicated)
router.get('/:group_id/library', async (req, res) => {
  try {
    // 1. Auth check
    const userId = req.user?.user_id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { group_id } = req.params;

    // 2. Access check - must be active member
    const hasAccess = await isActiveMember(userId, group_id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // 3. Get confirmed group members (exclude pending)
    const memberRecords = await UserGroup.findAll({
      where: {
        group_id,
        status: 'active',
        role: { [Op.in]: ['member', 'admin', 'owner'] },
      },
      attributes: ['user_id'],
    });

    const auth0Ids = memberRecords.map(m => m.user_id);

    if (auth0Ids.length === 0) {
      return res.json({ games: [], members: [] });
    }

    // 4. Bridge Auth0 string IDs -> User UUIDs
    const users = await User.findAll({
      where: { user_id: { [Op.in]: auth0Ids } },
      attributes: ['id', 'user_id', 'username'],
    });

    const userUuids = users.map(u => u.id);
    // Map UUID -> { username, auth0Id } for owner attribution
    const uuidToUser = {};
    for (const u of users) {
      uuidToUser[u.id] = { username: u.username, user_id: u.user_id };
    }

    if (userUuids.length === 0) {
      return res.json({ games: [], members: [] });
    }

    // 5. Query all games owned by these members
    // CRITICAL: UserGame.user_id is UUID, NOT Auth0 string
    const userGames = await UserGame.findAll({
      where: { user_id: { [Op.in]: userUuids } },
      include: [{
        model: Game,
        required: true, // INNER JOIN - skip orphaned UserGame records
        attributes: ['id', 'name', 'thumbnail_url', 'image_url', 'min_players', 'max_players', 'playing_time', 'weight'],
      }],
    });

    // 6. Deduplicate games, aggregate owners
    const gameMap = new Map();
    for (const ug of userGames) {
      const game = ug.Game;
      if (!game) continue;

      if (!gameMap.has(game.id)) {
        gameMap.set(game.id, {
          id: game.id,
          name: game.name,
          thumbnail_url: game.thumbnail_url,
          image_url: game.image_url,
          min_players: game.min_players,
          max_players: game.max_players,
          playing_time: game.playing_time,
          weight: game.weight != null ? parseFloat(game.weight) : null,
          owners: [],
        });
      }

      const owner = uuidToUser[ug.user_id];
      if (owner) {
        gameMap.get(game.id).owners.push({
          username: owner.username,
          user_id: owner.user_id,
        });
      }
    }

    // 7. Sort owners alphabetically, build response
    const games = Array.from(gameMap.values());
    for (const game of games) {
      game.owners.sort((a, b) => a.username.localeCompare(b.username));
    }

    // 8. Build member list sorted alphabetically
    const members = users
      .map(u => ({ user_id: u.user_id, username: u.username }))
      .sort((a, b) => a.username.localeCompare(b.username));

    res.json({ games, members });
  } catch (error) {
    console.error('Error getting group library:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;