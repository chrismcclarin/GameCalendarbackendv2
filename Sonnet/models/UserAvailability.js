// models/UserAvailability.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const UserAvailability = sequelize.define('UserAvailability', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  user_id: {
    type: DataTypes.STRING,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'user_id',
    },
    onDelete: 'CASCADE',
  },
  type: {
    type: DataTypes.ENUM('recurring_pattern', 'specific_override'),
    allowNull: false,
  },
  pattern_data: {
    type: DataTypes.JSONB,
    allowNull: false,
    // For recurring: { dayOfWeek: 0-6, startTime: "HH:MM", endTime: "HH:MM", timezone: "string" }
    // For specific: { date: "YYYY-MM-DD", startTime: "HH:MM", endTime: "HH:MM", isAvailable: boolean }
  },
  start_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  end_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  is_available: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    // true = free, false = busy (for specific overrides)
    // null for recurring patterns (they define available time)
  },
  timezone: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'UTC',
  },
}, {
  timestamps: true,
  indexes: [
    {
      fields: ['user_id']
    },
    {
      fields: ['type']
    },
    {
      fields: ['start_date', 'end_date']
    }
  ]
});

module.exports = UserAvailability;

