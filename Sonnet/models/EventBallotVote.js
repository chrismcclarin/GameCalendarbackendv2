// models/EventBallotVote.js
// Ballot vote model: stores per-user approval votes linked to ballot options
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const EventBallotVote = sequelize.define('EventBallotVote', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  option_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'EventBallotOptions',
      key: 'id',
    },
    onDelete: 'CASCADE',
  },
  user_id: {
    type: DataTypes.STRING,
    allowNull: false,
    // Auth0 string ID (e.g., "google-oauth2|107459289778553956693")
    // NOT UUID -- matches EventRsvp, UserGroup, MagicToken pattern
  },
}, {
  timestamps: true,
  indexes: [
    {
      fields: ['option_id'],
    },
    {
      fields: ['user_id'],
    },
    {
      fields: ['option_id', 'user_id'],
      unique: true, // one vote per option per user
    },
  ],
});

module.exports = EventBallotVote;
