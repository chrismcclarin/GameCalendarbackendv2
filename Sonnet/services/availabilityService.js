// services/availabilityService.js
// Service for calculating user availability by merging manual patterns and Google Calendar data

const { UserAvailability, User } = require('../models');
const googleCalendarService = require('./googleCalendarService');

class AvailabilityService {
  /**
   * Generate all 30-minute time slots for a date range
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @param {string} timezone - Timezone string
   * @returns {Array} Array of time slot objects
   */
  generateTimeSlots(startDate, endDate, timezone = 'UTC') {
    const slots = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Start from beginning of start date
    const current = new Date(start);
    current.setHours(0, 0, 0, 0);
    
    // Generate slots for each day until end date
    while (current <= end) {
      // Generate 30-minute slots for this day (00:00 to 23:30)
      for (let hour = 0; hour < 24; hour++) {
        for (let minute = 0; minute < 60; minute += 30) {
          const slotTime = new Date(current);
          slotTime.setHours(hour, minute, 0, 0);
          
          // Only include slots within the date range
          if (slotTime >= start && slotTime < end) {
            const dateStr = slotTime.toISOString().split('T')[0];
            const timeStr = slotTime.toTimeString().slice(0, 5); // HH:MM
            
            slots.push({
              date: dateStr,
              startTime: timeStr,
              endTime: this.add30Minutes(timeStr),
              timestamp: slotTime.getTime(),
            });
          }
        }
      }
      
      // Move to next day
      current.setDate(current.getDate() + 1);
      current.setHours(0, 0, 0, 0);
    }
    
    return slots;
  }

  /**
   * Add 30 minutes to a time string (HH:MM format)
   */
  add30Minutes(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes + 30;
    const newHours = Math.floor(totalMinutes / 60) % 24;
    const newMinutes = totalMinutes % 60;
    return `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}`;
  }

  /**
   * Check if a date falls within a date range (inclusive)
   */
  isDateInRange(date, startDate, endDate) {
    const checkDate = new Date(date);
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : null;
    
    if (end) {
      return checkDate >= start && checkDate <= end;
    }
    return checkDate >= start;
  }

  /**
   * Get day of week (0 = Sunday, 6 = Saturday)
   */
  getDayOfWeek(date) {
    return new Date(date).getDay();
  }

  /**
   * Check if a time slot matches a recurring pattern
   */
  matchesRecurringPattern(slot, pattern) {
    const slotDate = new Date(slot.date);
    const dayOfWeek = this.getDayOfWeek(slotDate);
    
    // Check if date is within pattern's date range
    if (!this.isDateInRange(slotDate, pattern.start_date, pattern.end_date)) {
      return false;
    }
    
    // Check if day of week matches
    if (pattern.pattern_data.dayOfWeek !== dayOfWeek) {
      return false;
    }
    
    // Check if time slot is within pattern's time range
    const slotStart = this.timeToMinutes(slot.startTime);
    const patternStart = this.timeToMinutes(pattern.pattern_data.startTime);
    const patternEnd = this.timeToMinutes(pattern.pattern_data.endTime);
    
    // Slot is available if it starts within the pattern's time range
    // and doesn't extend beyond it
    return slotStart >= patternStart && slotStart < patternEnd;
  }

  /**
   * Convert time string (HH:MM) to minutes since midnight
   */
  timeToMinutes(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Check if a time slot matches a specific override
   */
  matchesSpecificOverride(slot, override) {
    const slotDate = new Date(slot.date);
    const overrideDate = new Date(override.pattern_data.date);
    
    // Check if dates match
    if (slotDate.toISOString().split('T')[0] !== overrideDate.toISOString().split('T')[0]) {
      return false;
    }
    
    // Check if date is within override's date range
    if (!this.isDateInRange(slotDate, override.start_date, override.end_date)) {
      return false;
    }
    
    // Check if time slot is within override's time range
    const slotStart = this.timeToMinutes(slot.startTime);
    const overrideStart = this.timeToMinutes(override.pattern_data.startTime);
    const overrideEnd = this.timeToMinutes(override.pattern_data.endTime);
    
    return slotStart >= overrideStart && slotStart < overrideEnd;
  }

  /**
   * Calculate user's availability for a date range
   * Merges manual availability patterns with Google Calendar busy times
   * @param {Object} user - User object
   * @param {Date|string} startDate - Start date
   * @param {Date|string} endDate - End date
   * @param {string} timezone - Timezone string
   * @returns {Promise<Array>} Array of time slots with availability status
   */
  async calculateUserAvailability(user, startDate, endDate, timezone = 'UTC') {
    try {
      // Generate all time slots for the date range
      const allSlots = this.generateTimeSlots(startDate, endDate, timezone);
      
      // Initialize all slots as available (default: user is available)
      const availabilityMap = new Map();
      allSlots.forEach(slot => {
        availabilityMap.set(`${slot.date}_${slot.startTime}`, {
          ...slot,
          isAvailable: true,
          source: 'default', // 'default', 'recurring_pattern', 'specific_override', 'google_calendar'
        });
      });

      // Fetch manual availability patterns from database
      const manualPatterns = await UserAvailability.findAll({
        where: {
          user_id: user.user_id,
        },
        order: [['createdAt', 'ASC']],
      });

      // Apply recurring patterns first
      const recurringPatterns = manualPatterns.filter(p => p.type === 'recurring_pattern');
      for (const pattern of recurringPatterns) {
        allSlots.forEach(slot => {
          const key = `${slot.date}_${slot.startTime}`;
          if (this.matchesRecurringPattern(slot, pattern)) {
            const slotData = availabilityMap.get(key);
            if (slotData) {
              slotData.isAvailable = true;
              slotData.source = 'recurring_pattern';
            }
          }
        });
      }

      // Apply specific overrides (these take precedence over recurring patterns)
      const specificOverrides = manualPatterns.filter(p => p.type === 'specific_override');
      for (const override of specificOverrides) {
        allSlots.forEach(slot => {
          const key = `${slot.date}_${slot.startTime}`;
          if (this.matchesSpecificOverride(slot, override)) {
            const slotData = availabilityMap.get(key);
            if (slotData) {
              slotData.isAvailable = override.is_available !== false; // Default to true if not explicitly false
              slotData.source = 'specific_override';
            }
          }
        });
      }

      // If Google Calendar is enabled, fetch busy times and mark those slots as unavailable
      if (user.google_calendar_enabled && user.google_calendar_token) {
        try {
          const busySlots = await googleCalendarService.getBusyTimesForDateRange(
            user,
            startDate,
            endDate,
            timezone
          );

          // Mark busy slots as unavailable (unless overridden by specific override)
          busySlots.forEach(busySlot => {
            const key = `${busySlot.date}_${busySlot.startTime}`;
            const slotData = availabilityMap.get(key);
            if (slotData && slotData.source !== 'specific_override') {
              // Only override if not already set by specific override
              slotData.isAvailable = false;
              slotData.source = 'google_calendar';
            }
          });
        } catch (error) {
          console.error(`Error fetching Google Calendar busy times for user ${user.user_id}:`, error.message);
          // Continue without calendar data if there's an error
        }
      }

      // Convert map to array and return
      return Array.from(availabilityMap.values());
    } catch (error) {
      console.error('Error calculating user availability:', error);
      throw error;
    }
  }

  /**
   * Calculate overlapping free time for all group members
   * @param {string} groupId - Group ID
   * @param {Date|string} startDate - Start date
   * @param {Date|string} endDate - End date
   * @param {string} timezone - Timezone string
   * @returns {Promise<Array>} Array of time slots with overlap information
   */
  async calculateGroupOverlaps(groupId, startDate, endDate, timezone = 'UTC') {
    try {
      const { Group, UserGroup } = require('../models');
      
      // Get all group members
      const group = await Group.findByPk(groupId, {
        include: [{
          model: User,
          through: UserGroup,
          attributes: ['id', 'user_id', 'username', 'email', 'google_calendar_enabled', 'google_calendar_token', 'google_calendar_refresh_token'],
        }],
      });

      if (!group) {
        throw new Error('Group not found');
      }

      const members = group.Users || [];
      if (members.length === 0) {
        return [];
      }

      // Calculate availability for each member
      const memberAvailabilities = await Promise.all(
        members.map(member => 
          this.calculateUserAvailability(member, startDate, endDate, timezone)
            .then(availability => ({ member, availability }))
            .catch(error => {
              console.error(`Error calculating availability for member ${member.user_id}:`, error);
              return { member, availability: [] };
            })
        )
      );

      // Generate all time slots
      const allSlots = this.generateTimeSlots(startDate, endDate, timezone);
      
      // Calculate overlaps
      const overlaps = allSlots.map(slot => {
        const key = `${slot.date}_${slot.startTime}`;
        const availableMembers = [];
        
        memberAvailabilities.forEach(({ member, availability }) => {
          const memberSlot = availability.find(s => 
            s.date === slot.date && s.startTime === slot.startTime
          );
          
          if (memberSlot && memberSlot.isAvailable) {
            availableMembers.push({
              user_id: member.user_id,
              username: member.username,
              email: member.email,
            });
          }
        });

        return {
          date: slot.date,
          timeSlot: slot.startTime,
          endTime: slot.endTime,
          availableCount: availableMembers.length,
          totalMembers: members.length,
          availableMembers: availableMembers,
          unavailableCount: members.length - availableMembers.length,
        };
      });

      return overlaps;
    } catch (error) {
      console.error('Error calculating group overlaps:', error);
      throw error;
    }
  }
}

module.exports = new AvailabilityService();

