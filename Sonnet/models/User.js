// models/User.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  username: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  user_id: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  google_calendar_token: {
    type: DataTypes.TEXT,
    allowNull: true,
    // Note: In production, consider encrypting this field
  },
  google_calendar_refresh_token: {
    type: DataTypes.TEXT,
    allowNull: true,
    // Note: In production, consider encrypting this field
  },
  google_calendar_enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  email_notifications_enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false,
  },
  timezone: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'UTC',
    // IANA timezone format (e.g., America/New_York, Europe/London)
    // Used for displaying times in user's preferred timezone
  },
  tutorial_completed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false,
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: true,
    defaultValue: null,
    validate: {
      isE164(value) {
        if (value && !/^\+[1-9]\d{1,14}$/.test(value)) {
          throw new Error('Phone number must be in E.164 format (e.g., +14155552671)');
        }
      },
    },
  },
  sms_enabled: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  // Shape: { [type]: { email: bool, sms: bool } } -- null = use defaults
  notification_preferences: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: null,
  },
}, {
  timestamps: true,
  indexes: [
    {
      fields: ['user_id']
    }
  ]
});

module.exports = User;