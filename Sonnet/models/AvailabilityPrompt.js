// models/AvailabilityPrompt.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AvailabilityPrompt = sequelize.define('AvailabilityPrompt', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  group_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Groups',
      key: 'id',
    },
    onDelete: 'CASCADE',
    // Many prompts can exist for one group (over time)
  },
  game_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'Games',
      key: 'id',
    },
    onDelete: 'SET NULL',
    // Optional - prompt may or may not be for a specific game
  },
  prompt_date: {
    type: DataTypes.DATE,  // TIMESTAMP WITH TIME ZONE
    allowNull: false,
    // When the prompt was sent out
  },
  deadline: {
    type: DataTypes.DATE,  // TIMESTAMP WITH TIME ZONE
    allowNull: false,
    // When responses close
  },
  status: {
    type: DataTypes.ENUM('pending', 'active', 'closed', 'converted'),
    allowNull: false,
    defaultValue: 'pending',
    // pending: created but not sent
    // active: sent and accepting responses
    // closed: deadline passed or manually closed
    // converted: became an event
  },
  week_identifier: {
    type: DataTypes.STRING,
    allowNull: false,
    // Format: '2026-W05' (ISO week) for deduplication
    // Prevents sending duplicate prompts for same week
  },
  created_by_settings_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'GroupPromptSettings',
      key: 'id',
    },
    onDelete: 'SET NULL',
    // Tracks which schedule config created this prompt (null if manual)
  },
  custom_message: {
    type: DataTypes.TEXT,
    allowNull: true,
    // Optional custom message included in the prompt email
  },
  blind_voting_enabled: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    // When true, heatmap hidden until user submits or deadline passes
  },
}, {
  timestamps: true,
  indexes: [
    {
      fields: ['group_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['deadline']
    },
    {
      unique: true,
      fields: ['group_id', 'week_identifier'],
      name: 'availability_prompts_group_week_unique'
    }
  ]
});

module.exports = AvailabilityPrompt;
