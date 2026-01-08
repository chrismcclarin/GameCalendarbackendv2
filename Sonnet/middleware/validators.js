// middleware/validators.js
// Input validation middleware using express-validator
const { body, param, query, validationResult } = require('express-validator');

// Middleware to check validation results
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

// Group validators
const validateGroupCreate = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Group name must be between 1 and 50 characters')
    .notEmpty()
    .withMessage('Group name is required'),
  validate
];

const validateGroupUpdate = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Group name must be between 1 and 50 characters'),
  body('profile_picture_url')
    .custom((value) => {
      // If value is falsy (null, undefined, empty string), allow it
      if (value === null || value === undefined || value === '' || (typeof value === 'string' && value.trim() === '')) {
        return true;
      }
      // If value is provided, validate it's either a URL or an emoji
      if (typeof value !== 'string') {
        throw new Error('Profile picture URL must be a string');
      }
      
      // Check if it's a valid URL
      const urlRegex = /^https?:\/\/.+/;
      // Check if it's an emoji (single character or emoji sequence)
      const emojiRegex = /^[\p{Emoji}\p{Emoji_Presentation}\p{Emoji_Modifier_Base}\p{Emoji_Modifier}\p{Emoji_Component}]+$/u;
      
      if (!urlRegex.test(value) && !emojiRegex.test(value)) {
        throw new Error('Profile picture URL must be a valid URL or an emoji');
      }
      if (value.length > 500) {
        throw new Error('Profile picture URL must be less than 500 characters');
      }
      return true;
    }),
  body('background_color')
    .custom((value) => {
      // If value is falsy (null, undefined, empty string), allow it
      if (value === null || value === undefined || value === '' || (typeof value === 'string' && value.trim() === '')) {
        return true;
      }
      // If value is provided, validate it's a hex color
      if (typeof value !== 'string') {
        throw new Error('Background color must be a string');
      }
      if (!/^#[0-9A-Fa-f]{6}$/.test(value)) {
        throw new Error('Background color must be a valid hex color (e.g., #ffffff)');
      }
      return true;
    }),
  body('background_image_url')
    .custom((value) => {
      // If value is falsy (null, undefined, empty string), allow it
      if (value === null || value === undefined || value === '' || (typeof value === 'string' && value.trim() === '')) {
        return true;
      }
      // If value is provided, validate it's a URL
      if (typeof value !== 'string') {
        throw new Error('Background image URL must be a string');
      }
      const urlRegex = /^https?:\/\/.+/;
      if (!urlRegex.test(value)) {
        throw new Error('Background image URL must be a valid URL');
      }
      if (value.length > 500) {
        throw new Error('Background image URL must be less than 500 characters');
      }
      return true;
    }),
  validate
];

// Event validators
const validateEventCreate = [
  body('group_id')
    .isUUID()
    .withMessage('Group ID must be a valid UUID'),
  body('game_id')
    .isUUID()
    .withMessage('Game ID must be a valid UUID'),
  body('start_date')
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  body('duration_minutes')
    .isInt({ min: 1, max: 1440 })
    .withMessage('Duration is required and must be between 1 and 1440 minutes (24 hours)'),
  body('comments')
    .optional()
    .isLength({ max: 2000 })
    .withMessage('Comments must be less than 2000 characters'),
  body('is_group_win')
    .optional()
    .isBoolean()
    .withMessage('is_group_win must be a boolean'),
  body('participants')
    .optional()
    .isArray()
    .withMessage('Participants must be an array'),
  body('participants.*.user_id')
    .optional()
    .isUUID()
    .withMessage('Participant user_id must be a valid UUID'),
  body('participants.*.score')
    .optional({ checkFalsy: true })
    .custom((value) => {
      // Allow null, undefined, or empty string
      if (value === null || value === undefined || value === '') {
        return true;
      }
      // If provided, must be a non-negative number
      const numValue = parseFloat(value);
      return !isNaN(numValue) && numValue >= 0;
    })
    .withMessage('Participant score must be a non-negative number or empty'),
  body('participants.*.faction')
    .optional()
    .isLength({ max: 255 })
    .withMessage('Faction must be less than 255 characters'),
  validate
];

const validateEventUpdate = [
  body('group_id')
    .optional()
    .isUUID()
    .withMessage('Group ID must be a valid UUID'),
  body('game_id')
    .optional()
    .isUUID()
    .withMessage('Game ID must be a valid UUID'),
  body('start_date')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  body('duration_minutes')
    .optional()
    .isInt({ min: 1, max: 1440 })
    .withMessage('Duration must be between 1 and 1440 minutes (24 hours) when provided'),
  body('comments')
    .optional()
    .isLength({ max: 2000 })
    .withMessage('Comments must be less than 2000 characters'),
  validate
];

// Review validators
const validateReviewCreate = [
  body('group_id')
    .isUUID()
    .withMessage('Group ID must be a valid UUID'),
  body('game_id')
    .isUUID()
    .withMessage('Game ID must be a valid UUID'),
  body('rating')
    .optional()
    .isFloat({ min: 0, max: 5 })
    .withMessage('Rating must be between 0 and 5'),
  body('review_text')
    .optional()
    .isLength({ max: 5000 })
    .withMessage('Review text must be less than 5000 characters'),
  body('is_recommended')
    .optional()
    .isBoolean()
    .withMessage('is_recommended must be a boolean'),
  validate
];

// User search validators
const validateUserSearch = [
  query('email')
    .optional()
    .isEmail()
    .withMessage('Email must be a valid email address'),
  param('email')
    .optional()
    .isEmail()
    .withMessage('Email must be a valid email address'),
  validate
];

// BGG username validators
const validateBGGUsername = [
  body('bgg_username')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('BGG username must be between 1 and 50 characters')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('BGG username can only contain letters, numbers, hyphens, and underscores'),
  validate
];

// Feedback validators
const validateFeedback = [
  body('type')
    .isIn(['bug', 'suggestion', 'feature'])
    .withMessage('Type must be bug, suggestion, or feature'),
  body('subject')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Subject must be between 1 and 200 characters'),
  body('description')
    .trim()
    .isLength({ min: 1, max: 2000 })
    .withMessage('Description must be between 1 and 2000 characters'),
  body('user_email')
    .optional()
    .isEmail()
    .withMessage('User email must be a valid email address'),
  validate
];

// UUID parameter validators
const validateUUID = (paramName = 'id') => [
  param(paramName)
    .isUUID()
    .withMessage(`${paramName} must be a valid UUID`),
  validate
];

// Validate Auth0 user_id (not a UUID, can contain pipes, dashes, etc.)
// Format: provider|id (e.g., google-oauth2|107459289778553956693)
const validateAuth0UserId = (paramName = 'user_id') => [
  param(paramName)
    .isString()
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage(`${paramName} must be a valid user ID string`)
    .matches(/^[a-zA-Z0-9_\-|:]+$/)
    .withMessage(`${paramName} must be a valid Auth0 user ID format`),
  validate
];

module.exports = {
  validate,
  validateGroupCreate,
  validateGroupUpdate,
  validateEventCreate,
  validateEventUpdate,
  validateReviewCreate,
  validateUserSearch,
  validateBGGUsername,
  validateFeedback,
  validateUUID,
  validateAuth0UserId,
};

