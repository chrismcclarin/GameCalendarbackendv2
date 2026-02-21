// routes/groupPromptSettings.js
const express = require('express');
const crypto = require('crypto');
const { Group, User, UserGroup, GroupPromptSettings, Game } = require('../models');
const router = express.Router();

// Helper function to get user's role in a group
const getUserRoleInGroup = async (user_id, group_id) => {
  const user = await User.findOne({ where: { user_id } });
  if (!user) return null;

  const userGroup = await UserGroup.findOne({
    where: {
      user_id: user.user_id, // Use user.user_id (Auth0 string) not user.id (UUID)
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

// Helper function to check if user is a group member
const isGroupMember = async (user_id, group_id) => {
  const role = await getUserRoleInGroup(user_id, group_id);
  return role !== null;
};

// Helper function to generate template name from schedule data
const generateTemplateName = async (scheduleData, game_id = null) => {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = dayNames[scheduleData.schedule_day_of_week] || 'Unknown';
  const time = scheduleData.schedule_time || '00:00';

  let gameName = 'Game Session';
  if (game_id) {
    const game = await Game.findByPk(game_id);
    if (game) {
      gameName = game.name;
    }
  }

  return `${gameName} - ${dayName} ${time}`;
};

/**
 * GET /api/groups/:group_id/prompt-settings
 * Returns GroupPromptSettings for group, including schedules from template_config
 */
router.get('/:group_id/prompt-settings', async (req, res) => {
  try {
    const { group_id } = req.params;
    const user_id = req.user?.user_id;

    if (!user_id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Verify group exists
    const group = await Group.findByPk(group_id);

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Verify user is a group member
    const isMember = await isGroupMember(user_id, group_id);
    if (!isMember) {
      return res.status(403).json({ error: 'You must be a group member to view prompt settings' });
    }

    // Get prompt settings (or return default structure)
    let settings = await GroupPromptSettings.findOne({ where: { group_id } });

    // Filter out soft-deleted schedules
    let schedules = [];
    if (settings?.template_config?.schedules) {
      schedules = settings.template_config.schedules.filter(s => s.is_active !== false || s.deleted_at === undefined);
    }

    // Get group's games for dropdown selection
    // Games associated with the group through events
    const groupGames = await Game.findAll({
      include: [{
        model: require('../models').Event,
        where: { group_id },
        attributes: [],
        required: true
      }],
      attributes: ['id', 'name', 'image_url', 'min_players', 'max_players']
    });

    res.json({
      id: settings?.id || null,
      group_id,
      schedule_timezone: settings?.schedule_timezone || 'UTC',
      default_deadline_hours: settings?.default_deadline_hours || 72,
      default_token_expiry_hours: settings?.default_token_expiry_hours || 168,
      is_active: settings?.is_active ?? true,
      template_config: settings?.template_config || { schedules: [] },
      schedules: schedules.filter(s => !s.deleted_at), // Only return non-deleted schedules
      games: groupGames || []
    });
  } catch (error) {
    console.error('Error getting prompt settings:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/groups/:group_id/prompt-settings/schedules
 * Create new schedule entry in template_config.schedules array
 */
router.post('/:group_id/prompt-settings/schedules', async (req, res) => {
  try {
    const { group_id } = req.params;
    const user_id = req.user?.user_id;

    if (!user_id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Verify group exists
    const group = await Group.findByPk(group_id);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Verify user is owner or admin
    const hasPermission = await isOwnerOrAdmin(user_id, group_id);
    if (!hasPermission) {
      return res.status(403).json({ error: 'Only owners and admins can create schedules' });
    }

    // Validate required fields
    const {
      schedule_day_of_week,
      schedule_time,
      schedule_timezone,
      game_id,
      template_name,
      default_deadline_hours,
      default_token_expiry_hours,
      min_participants,
      selected_member_ids
    } = req.body;

    if (schedule_day_of_week === undefined || schedule_day_of_week === null) {
      return res.status(400).json({ error: 'schedule_day_of_week is required (0-6)' });
    }
    if (schedule_day_of_week < 0 || schedule_day_of_week > 6) {
      return res.status(400).json({ error: 'schedule_day_of_week must be 0-6' });
    }
    if (!schedule_time) {
      return res.status(400).json({ error: 'schedule_time is required (HH:MM format)' });
    }
    if (!schedule_timezone) {
      return res.status(400).json({ error: 'schedule_timezone is required' });
    }

    // Find or create GroupPromptSettings
    let settings = await GroupPromptSettings.findOne({ where: { group_id } });
    if (!settings) {
      settings = await GroupPromptSettings.create({
        group_id,
        schedule_timezone,
        template_config: { schedules: [] }
      });
    }

    // Generate template name if not provided
    const finalTemplateName = template_name || await generateTemplateName(
      { schedule_day_of_week, schedule_time },
      game_id
    );

    // Create new schedule object
    const newSchedule = {
      id: crypto.randomUUID(),
      schedule_day_of_week,
      schedule_time,
      schedule_timezone,
      game_id: game_id || null,
      template_name: finalTemplateName,
      default_deadline_hours: default_deadline_hours || 72,
      default_token_expiry_hours: default_token_expiry_hours || 168,
      min_participants: min_participants || null,
      selected_member_ids: selected_member_ids || [],
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Add to schedules array (read-modify-write pattern)
    const currentSchedules = settings.template_config?.schedules || [];
    const updatedSchedules = [...currentSchedules, newSchedule];

    await settings.update({
      template_config: {
        ...settings.template_config,
        schedules: updatedSchedules
      }
    });

    res.status(201).json({
      message: 'Schedule created successfully',
      schedule: newSchedule
    });
  } catch (error) {
    console.error('Error creating schedule:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/groups/:group_id/prompt-settings/schedules/:schedule_id
 * Update existing schedule in template_config.schedules array
 */
router.patch('/:group_id/prompt-settings/schedules/:schedule_id', async (req, res) => {
  try {
    const { group_id, schedule_id } = req.params;
    const user_id = req.user?.user_id;

    if (!user_id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Verify group exists
    const group = await Group.findByPk(group_id);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Verify user is owner or admin
    const hasPermission = await isOwnerOrAdmin(user_id, group_id);
    if (!hasPermission) {
      return res.status(403).json({ error: 'Only owners and admins can update schedules' });
    }

    // Get settings
    const settings = await GroupPromptSettings.findOne({ where: { group_id } });
    if (!settings) {
      return res.status(404).json({ error: 'Prompt settings not found' });
    }

    // Find schedule in array
    const schedules = settings.template_config?.schedules || [];
    const scheduleIndex = schedules.findIndex(s => s.id === schedule_id);

    if (scheduleIndex === -1) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    // Validate day_of_week if provided
    if (req.body.schedule_day_of_week !== undefined) {
      if (req.body.schedule_day_of_week < 0 || req.body.schedule_day_of_week > 6) {
        return res.status(400).json({ error: 'schedule_day_of_week must be 0-6' });
      }
    }

    // Merge updates
    const updatedSchedule = {
      ...schedules[scheduleIndex],
      ...req.body,
      id: schedule_id, // Preserve original ID
      updated_at: new Date().toISOString()
    };

    // Update schedules array
    const updatedSchedules = [...schedules];
    updatedSchedules[scheduleIndex] = updatedSchedule;

    await settings.update({
      template_config: {
        ...settings.template_config,
        schedules: updatedSchedules
      }
    });

    res.json({
      message: 'Schedule updated successfully',
      schedule: updatedSchedule
    });
  } catch (error) {
    console.error('Error updating schedule:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/groups/:group_id/prompt-settings/schedules/:schedule_id
 * Soft delete: set is_active: false and deleted_at timestamp
 */
router.delete('/:group_id/prompt-settings/schedules/:schedule_id', async (req, res) => {
  try {
    const { group_id, schedule_id } = req.params;
    const user_id = req.user?.user_id;

    if (!user_id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Verify group exists
    const group = await Group.findByPk(group_id);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Verify user is owner or admin
    const hasPermission = await isOwnerOrAdmin(user_id, group_id);
    if (!hasPermission) {
      return res.status(403).json({ error: 'Only owners and admins can delete schedules' });
    }

    // Get settings
    const settings = await GroupPromptSettings.findOne({ where: { group_id } });
    if (!settings) {
      return res.status(404).json({ error: 'Prompt settings not found' });
    }

    // Find schedule in array
    const schedules = settings.template_config?.schedules || [];
    const scheduleIndex = schedules.findIndex(s => s.id === schedule_id);

    if (scheduleIndex === -1) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    // Soft delete: mark as inactive and add deleted_at
    const updatedSchedules = [...schedules];
    updatedSchedules[scheduleIndex] = {
      ...updatedSchedules[scheduleIndex],
      is_active: false,
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await settings.update({
      template_config: {
        ...settings.template_config,
        schedules: updatedSchedules
      }
    });

    res.json({
      message: 'Schedule deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting schedule:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/groups/:group_id/prompt-settings/schedules/:schedule_id/toggle
 * Toggle is_active status (pause/resume schedule)
 */
router.patch('/:group_id/prompt-settings/schedules/:schedule_id/toggle', async (req, res) => {
  try {
    const { group_id, schedule_id } = req.params;
    const user_id = req.user?.user_id;

    if (!user_id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Verify group exists
    const group = await Group.findByPk(group_id);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Verify user is owner or admin
    const hasPermission = await isOwnerOrAdmin(user_id, group_id);
    if (!hasPermission) {
      return res.status(403).json({ error: 'Only owners and admins can toggle schedules' });
    }

    // Get settings
    const settings = await GroupPromptSettings.findOne({ where: { group_id } });
    if (!settings) {
      return res.status(404).json({ error: 'Prompt settings not found' });
    }

    // Find schedule in array
    const schedules = settings.template_config?.schedules || [];
    const scheduleIndex = schedules.findIndex(s => s.id === schedule_id);

    if (scheduleIndex === -1) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    // Check if schedule was soft-deleted
    if (schedules[scheduleIndex].deleted_at) {
      return res.status(400).json({ error: 'Cannot toggle a deleted schedule' });
    }

    // Toggle is_active status
    const updatedSchedules = [...schedules];
    const currentActive = updatedSchedules[scheduleIndex].is_active ?? true;
    updatedSchedules[scheduleIndex] = {
      ...updatedSchedules[scheduleIndex],
      is_active: !currentActive,
      updated_at: new Date().toISOString()
    };

    await settings.update({
      template_config: {
        ...settings.template_config,
        schedules: updatedSchedules
      }
    });

    res.json({
      message: `Schedule ${!currentActive ? 'activated' : 'paused'} successfully`,
      schedule: updatedSchedules[scheduleIndex]
    });
  } catch (error) {
    console.error('Error toggling schedule:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
