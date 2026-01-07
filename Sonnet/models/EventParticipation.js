// models/EventParticipation.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');


const EventParticipation = sequelize.define('EventParticipation', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  event_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  score: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  },
  faction: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  is_new_player: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  placement: {
    type: DataTypes.INTEGER,
    allowNull: true, // 1st, 2nd, 3rd place, etc.
  },
}, {
  timestamps: true,
  indexes: [
    {
      fields: ['event_id']
    },
    {
      fields: ['event_id', 'user_id'],
      unique: true
    }
  ]
});


module.exports = EventParticipation;