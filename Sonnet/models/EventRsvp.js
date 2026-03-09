// models/EventRsvp.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const EventRsvp = sequelize.define('EventRsvp', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  event_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Events',
      key: 'id',
    },
    onDelete: 'CASCADE',
  },
  user_id: {
    type: DataTypes.STRING,
    allowNull: false,
    // Auth0 string ID (e.g., "google-oauth2|107459289778553956693")
    // NOT UUID -- matches UserGroup, MagicToken, AvailabilityResponse pattern
  },
  status: {
    type: DataTypes.ENUM('yes', 'no', 'maybe'),
    allowNull: false,
  },
  note: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
}, {
  timestamps: true,
  indexes: [
    {
      fields: ['event_id'],
    },
    {
      fields: ['user_id'],
    },
    {
      fields: ['event_id', 'user_id'],
      unique: true,
    },
  ],
});

module.exports = EventRsvp;
