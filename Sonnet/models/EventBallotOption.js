// models/EventBallotOption.js
// Ballot option model: stores game options for an event ballot
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const EventBallotOption = sequelize.define('EventBallotOption', {
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
  game_id: {
    type: DataTypes.UUID,
    allowNull: true, // null for free-text game entries not in the system
    references: {
      model: 'Games',
      key: 'id',
    },
  },
  game_name: {
    type: DataTypes.STRING,
    allowNull: false, // always stores the display name regardless of game_id
  },
  display_order: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
}, {
  timestamps: true,
  indexes: [
    {
      fields: ['event_id'],
    },
    {
      fields: ['event_id', 'game_name'],
      unique: true, // prevent duplicate game names on the same ballot
    },
  ],
});

module.exports = EventBallotOption;
