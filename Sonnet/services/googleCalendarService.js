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

  /**
   * Get busy times from Google Calendar for a date range
   * Uses the freebusy API for efficiency
   * @param {Object} user - User object with google_calendar_token and google_calendar_refresh_token
   * @param {Date|string} startDate - Start date for query
   * @param {Date|string} endDate - End date for query
   * @param {string} timezone - Timezone for the query (default: UTC)
   * @returns {Promise<Array>} Array of busy time slots in 30-minute blocks
   * Format: [{ date: "YYYY-MM-DD", startTime: "HH:MM", endTime: "HH:MM" }, ...]
   */
  async getBusyTimesForDateRange(user, startDate, endDate, timezone = 'UTC') {
    try {
      if (!user.google_calendar_token) {
        return [];
      }

      let accessToken = user.google_calendar_token;
      const refreshToken = user.google_calendar_refresh_token;

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

      // Convert dates to ISO strings
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      // Use freebusy API for efficiency
      const freebusyResponse = await calendar.freebusy.query({
        requestBody: {
          timeMin: start.toISOString(),
          timeMax: end.toISOString(),
          timeZone: timezone,
          items: [{ id: 'primary' }],
        },
      });

      // Extract busy periods
      const busyPeriods = freebusyResponse.data.calendars?.primary?.busy || [];
      
      // Convert busy periods to 30-minute time slots
      const busySlots = [];
      
      for (const period of busyPeriods) {
        const periodStart = new Date(period.start);
        const periodEnd = new Date(period.end);
        
        // Round start time down to nearest 30 minutes
        const startMinutes = periodStart.getMinutes();
        const roundedStartMinutes = Math.floor(startMinutes / 30) * 30;
        const slotStart = new Date(periodStart);
        slotStart.setMinutes(roundedStartMinutes, 0, 0);
        
        // Round end time up to nearest 30 minutes
        const endMinutes = periodEnd.getMinutes();
        const roundedEndMinutes = Math.ceil(endMinutes / 30) * 30;
        const slotEnd = new Date(periodEnd);
        if (roundedEndMinutes === 60) {
          slotEnd.setHours(slotEnd.getHours() + 1);
          slotEnd.setMinutes(0, 0, 0);
        } else {
          slotEnd.setMinutes(roundedEndMinutes, 0, 0);
        }
        
        // Generate 30-minute slots
        let currentSlot = new Date(slotStart);
        const maxSlots = 10000; // Safety limit: maximum 10,000 slots per busy period
        let slotCount = 0;
        
        while (currentSlot < slotEnd) {
          // Safety check to prevent infinite loops
          if (slotCount++ > maxSlots) {
            console.error('Safety limit reached in getBusyTimesForDateRange. Stopping to prevent infinite loop.');
            break;
          }
          
          const nextSlot = new Date(currentSlot.getTime() + 30 * 60 * 1000);
          
          // Format as date and time strings
          const dateStr = currentSlot.toISOString().split('T')[0];
          const timeStr = currentSlot.toTimeString().slice(0, 5); // HH:MM format
          const endTimeStr = nextSlot.toTimeString().slice(0, 5);
          
          busySlots.push({
            date: dateStr,
            startTime: timeStr,
            endTime: endTimeStr,
          });
          
          const previousTime = currentSlot.getTime();
          currentSlot = nextSlot;
          
          // Safety check: ensure time actually advanced
          if (currentSlot.getTime() === previousTime) {
            console.error('Time did not advance in getBusyTimesForDateRange. Stopping to prevent infinite loop.');
            break;
          }
        }
      }

      return busySlots;
    } catch (error) {
      // If token expired and we have a refresh token, try to refresh and retry
      if (error.code === 401 && user.google_calendar_refresh_token) {
        try {
          console.log('Access token expired, attempting to refresh...');
          const newAccessToken = await this.refreshAccessToken(user.google_calendar_refresh_token);
          
          // Update user object with new token
          user.google_calendar_token = newAccessToken;
          
          // Retry the request
          return await this.getBusyTimesForDateRange(user, startDate, endDate, timezone);
        } catch (refreshError) {
          console.error('Error refreshing token and retrying:', refreshError.message);
          throw new Error(`Failed to get busy times after token refresh: ${refreshError.message}`);
        }
      }
      
      console.error('Error getting busy times from Google Calendar:', error.message);
      throw new Error(`Failed to get busy times: ${error.message}`);
    }
  }
}

module.exports = new GoogleCalendarService();
