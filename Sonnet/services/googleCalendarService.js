// services/googleCalendarService.js
// Google Calendar integration service
// NOTE: This requires Google OAuth 2.0 setup and user authorization
// See GOOGLE_CALENDAR_SETUP.md for setup instructions

const { google } = require('googleapis');

class GoogleCalendarService {
  /**
   * Check if event is in the future (only future events should be added to calendars)
   */
  isFutureEvent(startDate) {
    return new Date(startDate) > new Date();
  }

  /**
   * Refresh an expired access token using refresh token
   * @param {string} refreshToken - User's Google OAuth refresh token
   * @returns {Promise<string>} New access token
   */
  async refreshAccessToken(refreshToken) {
    try {
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4000/api/auth/google/callback'
      );

      oauth2Client.setCredentials({
        refresh_token: refreshToken,
      });

      const { credentials } = await oauth2Client.refreshAccessToken();
      return credentials.access_token;
    } catch (error) {
      console.error('Error refreshing access token:', error.message);
      throw new Error(`Failed to refresh access token: ${error.message}`);
    }
  }

  /**
   * Create a calendar event for a user
   * @param {Object} eventData - Event data including start_date, duration_minutes, game_name, comments
   * @param {Array} participantEmails - Array of participant email addresses
   * @param {string} accessToken - User's Google OAuth access token
   * @param {string} refreshToken - User's Google OAuth refresh token (optional, for auto-refresh)
   * @returns {Promise<Object>} Created calendar event
   */
  async createCalendarEventForUser(eventData, participantEmails, accessToken, refreshToken = null) {
    try {
      if (!accessToken) {
        throw new Error('Google Calendar access token is required');
      }

      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4000/api/auth/google/callback'
      );

      oauth2Client.setCredentials({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
      
      const startDate = new Date(eventData.start_date);
      const endDate = new Date(startDate.getTime() + (eventData.duration_minutes || 60) * 60 * 1000);

      const calendarEvent = {
        summary: eventData.game_name ? `Board Game: ${eventData.game_name}` : 'Board Game Session',
        description: eventData.comments || `Game session with ${participantEmails.length} players`,
        start: {
          dateTime: startDate.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        },
        end: {
          dateTime: endDate.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        },
        attendees: participantEmails.map(email => ({ email })),
        sendUpdates: 'all', // Send invitations to all attendees
        reminders: {
          useDefault: true,
        },
      };

      const response = await calendar.events.insert({
        calendarId: 'primary',
        resource: calendarEvent,
      });

      return response.data;
    } catch (error) {
      // If token expired and we have a refresh token, try to refresh and retry
      if (error.code === 401 && refreshToken) {
        try {
          console.log('Access token expired, attempting to refresh...');
          const newAccessToken = await this.refreshAccessToken(refreshToken);
          
          // Retry with new token
          const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4000/api/auth/google/callback'
          );
          oauth2Client.setCredentials({
            access_token: newAccessToken,
            refresh_token: refreshToken,
          });
          
          const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
          const response = await calendar.events.insert({
            calendarId: 'primary',
            resource: calendarEvent,
          });
          
          // Return new access token so caller can update it
          return { 
            ...response.data, 
            _new_access_token: newAccessToken 
          };
        } catch (refreshError) {
          console.error('Error refreshing token and retrying:', refreshError.message);
          throw new Error(`Failed to create calendar event after token refresh: ${refreshError.message}`);
        }
      }
      
      console.error('Error creating Google Calendar event:', error.message);
      throw new Error(`Failed to create calendar event: ${error.message}`);
    }
  }

  /**
   * Create calendar events for all group members who have Google Calendar connected
   * This is called after creating a future event
   * 
   * IMPORTANT: 
   * - Only users with Google Calendar connected (OAuth tokens) will have events added to their calendar
   * - However, ALL group members' emails (including non-Gmail) will receive invitation emails
   * - Non-Gmail users can manually add the event from the invitation email
   * 
   * @param {Object} eventData - Event data
   * @param {Array} groupMembers - Array of group member objects with email and google_calendar_token
   * @returns {Promise<Array>} Array of created calendar events (may be empty if no tokens)
   */
  async createCalendarEventsForGroup(eventData, groupMembers) {
    const results = [];
    
    // Get ALL participant emails (Gmail and non-Gmail users)
    // Google Calendar API can send invitations to any email address
    const participantEmails = groupMembers
      .filter(m => m.email)
      .map(m => m.email);

    if (participantEmails.length === 0) {
      console.log('No group members have email addresses');
      return results;
    }
    
    // Filter members who have Google Calendar enabled and valid tokens
    // We only need ONE user with Google Calendar connected to create the event
    // and send invitations to everyone
    const membersWithCalendar = groupMembers.filter(member => 
      member.google_calendar_enabled && 
      member.google_calendar_token && 
      member.email
    );

    if (membersWithCalendar.length === 0) {
      console.log('No group members have Google Calendar connected - invitations cannot be sent');
      return results;
    }

    // Create calendar event from the first user with Google Calendar connected
    // This will send invitation emails to ALL participants (including non-Gmail users)
    // Only the event creator's calendar will have the event automatically added
    try {
      const firstMemberWithCalendar = membersWithCalendar[0];
      const calendarEvent = await this.createCalendarEventForUser(
        eventData,
        participantEmails, // Send invitations to ALL emails (Gmail and non-Gmail)
        firstMemberWithCalendar.google_calendar_token,
        firstMemberWithCalendar.google_calendar_refresh_token
      );
      
      // If token was refreshed, update it in the database
      if (calendarEvent._new_access_token) {
        const { User } = require('../models');
        await User.update(
          { google_calendar_token: calendarEvent._new_access_token },
          { where: { id: firstMemberWithCalendar.id } }
        );
        delete calendarEvent._new_access_token; // Remove from response
      }
      
      results.push({ 
        member_id: firstMemberWithCalendar.id, 
        calendar_event: calendarEvent,
        invitations_sent_to: participantEmails // Track who received invitations
      });
      console.log(`Calendar event created and invitations sent to ${participantEmails.length} participants`);
    } catch (error) {
      console.error(`Failed to create calendar event:`, error);
    }

    return results;
  }
}

module.exports = new GoogleCalendarService();
