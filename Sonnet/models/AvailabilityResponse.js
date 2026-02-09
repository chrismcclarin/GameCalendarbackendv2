// models/AvailabilityResponse.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AvailabilityResponse = sequelize.define('AvailabilityResponse', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  prompt_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'AvailabilityPrompts',
      key: 'id',
    },
    onDelete: 'CASCADE',
    // Response deleted when prompt deleted
  },
  user_id: {
    type: DataTypes.STRING,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'user_id',  // Auth0 string ID, not UUID
    },
    onDelete: 'CASCADE',
    // Response deleted when user deleted
  },
  time_slots: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: [],
    // Array of availability slots:
    // [{ start: ISO8601, end: ISO8601, preference: 'preferred'|'if-need-be' }]
  },
  user_timezone: {
    type: DataTypes.STRING,
    allowNull: false,
    // IANA timezone at time of submission (e.g., 'America/New_York')
    // Preserved for display purposes even if user changes timezone later
  },
  submitted_at: {
    type: DataTypes.DATE,  // TIMESTAMP WITH TIME ZONE
    allowNull: false,
    // When the user submitted their response
    // Different from createdAt if user updates response
  },
  magic_token_used: {
    type: DataTypes.STRING,
    allowNull: true,
    // Audit field: which token was used to submit (if any)
    // Null if submitted via authenticated session
  },
  last_reminded_at: {
    type: DataTypes.DATE,
    allowNull: true,
    // Timestamp of last reminder email sent to this user for this prompt
  },
}, {
  timestamps: true,
  indexes: [
    {
      fields: ['prompt_id']
    },
    {
      fields: ['user_id']
    },
    {
      unique: true,
      fields: ['prompt_id', 'user_id'],
      name: 'availability_responses_prompt_user_unique'
    }
  ]
});

module.exports = AvailabilityResponse;
