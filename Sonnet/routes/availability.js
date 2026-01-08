// routes/availability.js
// Routes for managing user availability and group planning
const express = require('express');
const { UserAvailability, User } = require('../models');
const availabilityService = require('../services/availabilityService');
const { handleServerError } = require('../utils/errorHandler');
const router = express.Router();
const { body, param, query, validationResult } = require('express-validator');

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      error: 'Validation failed',
      errors: errors.array().map(err => ({
        field: err.path || err.param,
        message: err.msg,
        value: err.value
      }))
    });
  }
  next();
};

// Validate UUID parameter
const validateUUID = (paramName) => [
  param(paramName).isUUID().withMessage(`${paramName} must be a valid UUID`),
  validate
];

// Get user's availability for a date range
router.get('/user/:user_id', 
  validateUUID('user_id'),
  async (req, res) => {
    try {
      const verified_user_id = req.user?.user_id;
      if (!verified_user_id) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Users can only view their own availability
      if (req.params.user_id !== verified_user_id) {
        return res.status(403).json({ error: 'Forbidden: Cannot access other users\' availability' });
      }

      const user = await User.findOne({ where: { user_id: verified_user_id } });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Parse query parameters
      const startDate = req.query.start_date ? new Date(req.query.start_date) : new Date();
      const endDate = req.query.end_date ? new Date(req.query.end_date) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Default: 30 days
      const timezone = req.query.timezone || 'UTC';

      // Validate dates
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return res.status(400).json({ error: 'Invalid date format. Use ISO 8601 format (YYYY-MM-DD)' });
      }

      if (startDate >= endDate) {
        return res.status(400).json({ error: 'Start date must be before end date' });
      }

      const availability = await availabilityService.calculateUserAvailability(
        user,
        startDate,
        endDate,
        timezone
      );

      res.json(availability);
    } catch (error) {
      handleServerError(res, error, 'Error fetching user availability');
    }
  }
);

// Create recurring availability pattern
router.post('/user/:user_id/recurring',
  validateUUID('user_id'),
  [
    body('dayOfWeek')
      .isInt({ min: 0, max: 6 })
      .withMessage('Day of week must be between 0 (Sunday) and 6 (Saturday)'),
    body('startTime')
      .matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/)
      .withMessage('Start time must be in HH:MM format (24-hour)'),
    body('endTime')
      .matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/)
      .withMessage('End time must be in HH:MM format (24-hour)'),
    body('start_date')
      .isISO8601()
      .withMessage('Start date must be a valid ISO 8601 date (YYYY-MM-DD)'),
    body('end_date')
      .optional()
      .isISO8601()
      .withMessage('End date must be a valid ISO 8601 date (YYYY-MM-DD)'),
    body('timezone')
      .optional()
      .isString()
      .withMessage('Timezone must be a string'),
    validate
  ],
  async (req, res) => {
    try {
      const verified_user_id = req.user?.user_id;
      if (!verified_user_id) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (req.params.user_id !== verified_user_id) {
        return res.status(403).json({ error: 'Forbidden: Cannot create availability for other users' });
      }

      const { dayOfWeek, startTime, endTime, start_date, end_date, timezone } = req.body;

      // Validate time range
      const [startHours, startMinutes] = startTime.split(':').map(Number);
      const [endHours, endMinutes] = endTime.split(':').map(Number);
      const startTotalMinutes = startHours * 60 + startMinutes;
      const endTotalMinutes = endHours * 60 + endMinutes;

      if (startTotalMinutes >= endTotalMinutes) {
        return res.status(400).json({ error: 'Start time must be before end time' });
      }

      // Validate date range
      const startDate = new Date(start_date);
      const endDateObj = end_date ? new Date(end_date) : null;
      
      if (endDateObj && startDate >= endDateObj) {
        return res.status(400).json({ error: 'Start date must be before end date' });
      }

      const pattern = await UserAvailability.create({
        user_id: verified_user_id,
        type: 'recurring_pattern',
        pattern_data: {
          dayOfWeek,
          startTime,
          endTime,
          timezone: timezone || 'UTC',
        },
        start_date: startDate,
        end_date: endDateObj,
        timezone: timezone || 'UTC',
      });

      res.status(201).json(pattern);
    } catch (error) {
      handleServerError(res, error, 'Error creating recurring availability pattern');
    }
  }
);

// Create specific date/time override
router.post('/user/:user_id/override',
  validateUUID('user_id'),
  [
    body('date')
      .isISO8601()
      .withMessage('Date must be a valid ISO 8601 date (YYYY-MM-DD)'),
    body('startTime')
      .matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/)
      .withMessage('Start time must be in HH:MM format (24-hour)'),
    body('endTime')
      .matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/)
      .withMessage('End time must be in HH:MM format (24-hour)'),
    body('isAvailable')
      .optional()
      .isBoolean()
      .withMessage('isAvailable must be a boolean'),
    validate
  ],
  async (req, res) => {
    try {
      const verified_user_id = req.user?.user_id;
      if (!verified_user_id) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (req.params.user_id !== verified_user_id) {
        return res.status(403).json({ error: 'Forbidden: Cannot create availability for other users' });
      }

      const { date, startTime, endTime, isAvailable = true } = req.body;

      // Validate time range
      const [startHours, startMinutes] = startTime.split(':').map(Number);
      const [endHours, endMinutes] = endTime.split(':').map(Number);
      const startTotalMinutes = startHours * 60 + startMinutes;
      const endTotalMinutes = endHours * 60 + endMinutes;

      if (startTotalMinutes >= endTotalMinutes) {
        return res.status(400).json({ error: 'Start time must be before end time' });
      }

      const overrideDate = new Date(date);
      if (isNaN(overrideDate.getTime())) {
        return res.status(400).json({ error: 'Invalid date format' });
      }

      const override = await UserAvailability.create({
        user_id: verified_user_id,
        type: 'specific_override',
        pattern_data: {
          date,
          startTime,
          endTime,
          isAvailable,
        },
        start_date: overrideDate,
        end_date: overrideDate, // Same day
        is_available: isAvailable,
        timezone: 'UTC',
      });

      res.status(201).json(override);
    } catch (error) {
      handleServerError(res, error, 'Error creating availability override');
    }
  }
);

// Delete availability pattern/override
router.delete('/:id',
  validateUUID('id'),
  async (req, res) => {
    try {
      const verified_user_id = req.user?.user_id;
      if (!verified_user_id) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const availability = await UserAvailability.findByPk(req.params.id);
      if (!availability) {
        return res.status(404).json({ error: 'Availability pattern not found' });
      }

      // Users can only delete their own availability
      if (availability.user_id !== verified_user_id) {
        return res.status(403).json({ error: 'Forbidden: Cannot delete other users\' availability' });
      }

      await availability.destroy();
      res.json({ message: 'Availability pattern deleted successfully' });
    } catch (error) {
      handleServerError(res, error, 'Error deleting availability pattern');
    }
  }
);

// Get overlapping free time for all group members
router.get('/group/:group_id/overlaps',
  validateUUID('group_id'),
  async (req, res) => {
    try {
      const verified_user_id = req.user?.user_id;
      if (!verified_user_id) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Verify user is a member of the group
      const { Group, UserGroup } = require('../models');
      const userGroup = await UserGroup.findOne({
        where: {
          group_id: req.params.group_id,
          user_id: verified_user_id,
        },
      });

      if (!userGroup) {
        return res.status(403).json({ error: 'Forbidden: You must be a member of this group' });
      }

      // Parse query parameters
      const startDate = req.query.start_date ? new Date(req.query.start_date) : new Date();
      const endDate = req.query.end_date ? new Date(req.query.end_date) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Default: 30 days
      const timezone = req.query.timezone || 'UTC';

      // Validate dates
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return res.status(400).json({ error: 'Invalid date format. Use ISO 8601 format (YYYY-MM-DD)' });
      }

      if (startDate >= endDate) {
        return res.status(400).json({ error: 'Start date must be before end date' });
      }

      const overlaps = await availabilityService.calculateGroupOverlaps(
        req.params.group_id,
        startDate,
        endDate,
        timezone
      );

      res.json(overlaps);
    } catch (error) {
      handleServerError(res, error, 'Error calculating group overlaps');
    }
  }
);

// Get user's availability patterns (for editing/deleting)
router.get('/user/:user_id/patterns',
  validateUUID('user_id'),
  async (req, res) => {
    try {
      const verified_user_id = req.user?.user_id;
      if (!verified_user_id) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (req.params.user_id !== verified_user_id) {
        return res.status(403).json({ error: 'Forbidden: Cannot access other users\' availability patterns' });
      }

      const patterns = await UserAvailability.findAll({
        where: { user_id: verified_user_id },
        order: [['createdAt', 'DESC']],
      });

      res.json(patterns);
    } catch (error) {
      handleServerError(res, error, 'Error fetching availability patterns');
    }
  }
);

module.exports = router;

