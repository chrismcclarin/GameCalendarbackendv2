// routes/events.js
const express = require('express');
const { Event, Game, User, Group, EventParticipation, UserGroup } = require('../models');
const { Op } = require('sequelize');
const router = express.Router();
const auth0Service = require('../services/auth0Service');
const googleCalendarService = require('../services/googleCalendarService');
const emailService = require('../services/emailService');

// Helper function to format event with custom participants
const formatEventWithCustomParticipants = (event) => {
  const eventData = event.toJSON ? event.toJSON() : event;
  
  // Combine regular participants (from EventParticipation) with custom participants
  const regularParticipants = (eventData.EventParticipations || []).map(ep => ({
    user_id: ep.User?.id,
    username: ep.User?.username,
    score: ep.score,
    faction: ep.faction,
    is_new_player: ep.is_new_player,
    placement: ep.placement,
    is_custom: false
  }));
  
  const customParticipants = (eventData.custom_participants || []).map(cp => ({
    user_id: null,
    username: cp.username,
    score: cp.score,
    faction: cp.faction,
    is_new_player: cp.is_new_player || false,
    placement: cp.placement,
    is_custom: true
  }));
  
  // Combine and sort by placement if available
  const allParticipants = [...regularParticipants, ...customParticipants];
  if (allParticipants.some(p => p.placement !== null)) {
    allParticipants.sort((a, b) => {
      if (a.placement === null) return 1;
      if (b.placement === null) return -1;
      return a.placement - b.placement;
    });
  }
  
  // Format winner and picked_by to include custom names
  let winner = null;
  if (eventData.Winner) {
    winner = {
      id: eventData.Winner.id,
      username: eventData.Winner.username
    };
  } else if (eventData.winner_name) {
    winner = {
      id: null,
      username: eventData.winner_name,
      is_custom: true
    };
  }
  
  let pickedBy = null;
  if (eventData.PickedBy) {
    pickedBy = {
      id: eventData.PickedBy.id,
      username: eventData.PickedBy.username
    };
  } else if (eventData.picked_by_name) {
    pickedBy = {
      id: null,
      username: eventData.picked_by_name,
      is_custom: true
    };
  }
  
  return {
    ...eventData,
    EventParticipations: allParticipants, // Replace with combined participants
    Winner: winner,
    PickedBy: pickedBy
  };
};
const { validateEventCreate, validateEventUpdate, validateUUID } = require('../middleware/validators');


// Helper function to verify user belongs to group
const verifyUserInGroup = async (user_id, group_id) => {
  const user = await User.findOne({ where: { user_id } });
  if (!user) return false;
  
  const userGroup = await UserGroup.findOne({
    where: {
      user_id: user.user_id, // Use user.user_id (Auth0 string) not user.id (UUID)
      group_id: group_id
    }
  });
  
  return !!userGroup;
};

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


// Get all events for a user across all their groups
router.get('/user/:user_id', async (req, res) => {
  try {
    let user = await User.findOne({ where: { user_id: req.params.user_id } });
    
    // If user doesn't exist but we have authenticated user info, auto-create
    if (!user && req.user && req.user.user_id === req.params.user_id) {
      let userEmail = req.user.email;
      let userName = req.user.name || req.user.nickname || req.user.given_name || req.user.email?.split('@')[0] || 'User';
      
      // If email is missing from token, try to fetch from Auth0 Management API
      if (!userEmail || userEmail.includes('@auth0.local') || userEmail.includes('@auth0')) {
        try {
          const auth0User = await auth0Service.getUserById(req.params.user_id);
          if (auth0User) {
            const userDetails = auth0Service.extractUserDetails(auth0User);
            userEmail = userDetails.email;
            userName = userDetails.username;
          }
        } catch (auth0Error) {
          // If Management API fails, continue with fallback
          console.warn('Auth0 Management API lookup failed during user creation:', auth0Error.message);
        }
      }
      
      // Improve username extraction for email/password users
      if (!userEmail || userEmail.includes('@auth0.local') || userEmail.includes('@auth0')) {
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
          }
        }
        
        user = newUser;
      } catch (error) {
        console.error('Error auto-creating user:', error.message);
        user = await User.findOne({ where: { user_id: req.params.user_id } });
        if (!user) {
          throw error;
        }
      }
    }
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get all groups the user belongs to
    const userGroups = await UserGroup.findAll({
      where: { user_id: user.user_id }, // Use user.user_id (Auth0 string) not user.id (UUID)
      attributes: ['group_id']
    });
    
    const groupIds = userGroups.map(ug => ug.group_id);
    
    if (groupIds.length === 0) {
      return res.json([]);
    }
    
    // Get all events from user's groups
    const events = await Event.findAll({
      where: { group_id: { [Op.in]: groupIds } },
      include: [
        { model: Game, attributes: ['id', 'name', 'image_url', 'theme'] },
        { 
          model: Group, 
          attributes: ['id', 'name', 'profile_picture_url', 'background_color', 'background_image_url'] 
        },
        { model: User, as: 'Winner', attributes: ['id', 'username'] },
        { model: User, as: 'PickedBy', attributes: ['id', 'username'] },
        {
          model: EventParticipation,
          include: [{ model: User, attributes: ['id', 'username', 'user_id'] }]
        }
      ],
      order: [['start_date', 'DESC']]
    });
    
    // Format all events with custom participants
    const formattedEvents = events.map(event => formatEventWithCustomParticipants(event));
    res.json(formattedEvents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all events for a group
router.get('/group/:group_id', async (req, res) => {
  try {
    const { user_id } = req.query;
    
    if (user_id) {
      const hasAccess = await verifyUserInGroup(user_id, req.params.group_id);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied to this group' });
      }
    }
    
    const events = await Event.findAll({
      where: { group_id: req.params.group_id },
      include: [
        { model: Game, attributes: ['name', 'image_url', 'theme'] },
        { model: User, as: 'Winner', attributes: ['id', 'username'] },
        { model: User, as: 'PickedBy', attributes: ['id', 'username'] },
        {
          model: EventParticipation,
          include: [{ model: User, attributes: ['id', 'username'] }]
        }
      ],
      order: [['start_date', 'DESC']]
    });
    
    // Format all events with custom participants
    const formattedEvents = events.map(event => formatEventWithCustomParticipants(event));
    res.json(formattedEvents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Create new event
router.post('/', validateEventCreate, async (req, res) => {
  try {
    const {
      group_id,
      game_id,
      start_date,
      duration_minutes,
      winner_id,
      picked_by_id,
      winner_name,
      picked_by_name,
      is_group_win,
      comments,
      participants, // Array of { user_id, score, faction, is_new_player, placement }
      custom_participants, // Array of { username, score, faction, is_new_player, placement }
      timezone // User's timezone (e.g., 'America/Los_Angeles')
    } = req.body;
    
    const event = await Event.create({
      group_id,
      game_id,
      start_date,
      duration_minutes,
      winner_id,
      picked_by_id,
      winner_name: winner_name || null,
      picked_by_name: picked_by_name || null,
      custom_participants: custom_participants || [],
      is_group_win,
      comments,
      status: 'completed'
    });
    
    // Create participations for group members (with user_id)
    if (participants && participants.length > 0) {
      const participationData = participants
        .filter(p => p.user_id) // Only include participants with user_id
        .map(p => ({
          event_id: event.id,
          user_id: p.user_id,
          score: p.score,
          faction: p.faction,
          is_new_player: p.is_new_player || false,
          placement: p.placement
        }));
      
      if (participationData.length > 0) {
        await EventParticipation.bulkCreate(participationData);
      }
    }
    
    // Fetch complete event data
    const completeEvent = await Event.findByPk(event.id, {
      include: [
        { model: Game, attributes: ['name', 'image_url'] },
        { model: User, as: 'Winner', attributes: ['id', 'username'] },
        { model: User, as: 'PickedBy', attributes: ['id', 'username'] },
        {
          model: EventParticipation,
          include: [{ model: User, attributes: ['id', 'username'] }]
        }
      ]
    });
    
    // Format event with custom participants
    const formattedEvent = formatEventWithCustomParticipants(completeEvent);
    
    // Check if event is in the future (for Google Calendar and email notifications)
    const isFutureEvent = googleCalendarService.isFutureEvent(start_date);
    
    if (isFutureEvent) {
      // Get group details for notifications
      const group = await Group.findByPk(group_id, {
        include: [{
          model: User,
          attributes: ['id', 'user_id', 'username', 'email', 'email_notifications_enabled', 'google_calendar_token', 'google_calendar_refresh_token', 'google_calendar_enabled'],
          through: { attributes: ['role'] }
        }]
      });
      
      if (group && group.Users) {
        const game = await Game.findByPk(game_id, { attributes: ['name'] });
        
        // Add to Google Calendar if event is in the future
        // NOTE: This requires users to have Google Calendar tokens stored
        // See GOOGLE_CALENDAR_SETUP.md for setup instructions
        try {
          const eventDataForCalendar = {
            start_date: start_date,
            duration_minutes: duration_minutes || 60,
            game_name: game?.name || 'Board Game',
            comments: comments || '',
            timezone: timezone || 'UTC' // Use user's timezone, fallback to UTC
          };
          
          // Create calendar events for members with Google Calendar connected
          // This will silently fail if no users have tokens, which is expected
          await googleCalendarService.createCalendarEventsForGroup(
            eventDataForCalendar,
            group.Users
          );
        } catch (calendarError) {
          // Log error but don't fail the event creation
          if (process.env.NODE_ENV === 'development') {
            console.error('Error adding event to Google Calendar (non-fatal):', calendarError.message);
          } else {
            console.error('Error adding event to Google Calendar (non-fatal)');
          }
        }
        
        // Send email notifications to event participants only
        // Only send to users who have email_notifications_enabled = true
        // Exclude custom/temporary participants (they don't have user_id)
        try {
          // Get participant user IDs from EventParticipations
          const participantUserIds = completeEvent.EventParticipations
            .filter(ep => ep.User && ep.User.id) // Only include participants with User data
            .map(ep => ep.User.id);
          
          // Get participant user details from group members
          const recipients = group.Users
            .filter(user => {
              // Only send to:
              // 1. Users who are participants in this event (user.id in participantUserIds)
              // 2. Valid email address
              // 3. Email notifications enabled (defaults to true if not set)
              // 4. Email is not @auth0.local (invalid email)
              return participantUserIds.includes(user.id) &&
                     user.email && 
                     user.email_notifications_enabled !== false &&
                     !user.email.includes('@auth0.local') &&
                     !user.email.includes('@auth0');
            })
            .map(user => ({
              email: user.email,
              name: user.username,
              user_id: user.user_id
            }));
          
          if (recipients.length > 0 && emailService.isConfigured()) {
            // Format start time from start_date
            const eventDate = new Date(start_date);
            const startTime = eventDate.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false
            });
            
            // Build event URL (assuming event detail page exists)
            // Use event.id which is available after creation
            const eventUrl = `${process.env.FRONTEND_URL || process.env.AUTH0_BASE_URL || 'http://localhost:3000'}/group/${group_id}/event/${event.id}`;
            
            const eventDataForEmail = {
              gameName: game?.name || 'Board Game',
              groupName: group.name,
              startDate: start_date,
              startTime: startTime,
              durationMinutes: duration_minutes || 60,
              location: null, // Can be added later if location field exists
              comments: comments || null,
              eventUrl: eventUrl
            };
            
            // Send emails asynchronously - don't wait for completion
            // This ensures event creation doesn't fail if emails fail
            emailService.sendGameSessionNotificationToMultiple(recipients, eventDataForEmail)
              .then(result => {
                if (process.env.NODE_ENV === 'development' || result.failed > 0) {
                  console.log(`Email notifications sent: ${result.successful}/${result.total} successful`);
                  if (result.failed > 0) {
                    console.error('Failed email recipients:', result.results.filter(r => !r.success).map(r => r.recipient));
                  }
                }
              })
              .catch(emailError => {
                console.error('Error sending email notifications (non-fatal):', emailError.message);
              });
          } else if (recipients.length > 0 && !emailService.isConfigured()) {
            if (process.env.NODE_ENV === 'development') {
              console.warn('Email service not configured. Skipping email notifications.');
            }
          }
        } catch (emailError) {
          // Log error but don't fail the event creation
          console.error('Error preparing email notifications (non-fatal):', emailError.message);
          if (process.env.NODE_ENV === 'development') {
            console.error('Email error details:', emailError);
          }
        }
      }
    }
    
    res.json(formattedEvent);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Update event
router.put('/:id', validateUUID('id'), validateEventUpdate, async (req, res) => {
  try {
    // Use verified user_id from token
    const requesting_user_id = req.user?.user_id;
    if (!requesting_user_id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const event = await Event.findByPk(req.params.id);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    // Check if user is owner or admin of the group
    const hasPermission = await isOwnerOrAdmin(requesting_user_id, event.group_id);
    if (!hasPermission) {
      return res.status(403).json({ error: 'Only group owners and admins can edit events' });
    }
    
    const {
      start_date,
      duration_minutes,
      winner_id,
      picked_by_id,
      winner_name,
      picked_by_name,
      is_group_win,
      comments,
      participants,
      custom_participants
    } = req.body;
    
    await event.update({
      start_date,
      duration_minutes,
      winner_id: winner_id || null,
      picked_by_id: picked_by_id || null,
      winner_name: winner_name || null,
      picked_by_name: picked_by_name || null,
      custom_participants: custom_participants || [],
      is_group_win,
      comments
    });
    
    // Update participations if provided
    if (participants) {
      // Remove existing participations
      await EventParticipation.destroy({ where: { event_id: event.id } });
      
      // Create new participations for group members (with user_id)
      if (participants.length > 0) {
        const participationData = participants
          .filter(p => p.user_id) // Only include participants with user_id
          .map(p => ({
            event_id: event.id,
            user_id: p.user_id,
            score: p.score,
            faction: p.faction,
            is_new_player: p.is_new_player || false,
            placement: p.placement
          }));
        
        if (participationData.length > 0) {
          await EventParticipation.bulkCreate(participationData);
        }
      }
    }
    
    // Fetch updated event
    const updatedEvent = await Event.findByPk(event.id, {
      include: [
        { model: Game, attributes: ['name', 'image_url'] },
        { model: User, as: 'Winner', attributes: ['id', 'username'] },
        { model: User, as: 'PickedBy', attributes: ['id', 'username'] },
        {
          model: EventParticipation,
          include: [{ model: User, attributes: ['id', 'username'] }]
        }
      ]
    });
    
    // Format event with custom participants
    const formattedEvent = formatEventWithCustomParticipants(updatedEvent);
    
    res.json(formattedEvent);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Delete event
router.delete('/:id', async (req, res) => {
  try {
    // Use verified user_id from token
    const requesting_user_id = req.user?.user_id;
    if (!requesting_user_id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const event = await Event.findByPk(req.params.id);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    // Check if user is owner or admin of the group
    const hasPermission = await isOwnerOrAdmin(requesting_user_id, event.group_id);
    if (!hasPermission) {
      return res.status(403).json({ error: 'Only group owners and admins can delete events' });
    }
    
    // Delete participations first
    await EventParticipation.destroy({ where: { event_id: event.id } });
    
    // Delete event
    await event.destroy();
    
    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


module.exports = router;