// models/EventBring.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const EventBring = sequelize.define('EventBring', {
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
    // NOT UUID -- matches EventRsvp, UserGroup pattern
  },
  game_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Games',
      key: 'id',
    },
    onDelete: 'CASCADE',
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
      fields: ['event_id', 'user_id', 'game_id'],
      unique: true,
    },
  ],
});

module.exports = EventBring;
