// models/Event.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');


const Event = sequelize.define('Event', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  group_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  game_id: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  start_date: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  duration_minutes: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  winner_id: {
    type: DataTypes.UUID,
    allowNull: true, // references User.id
  },
  picked_by_id: {
    type: DataTypes.UUID,
    allowNull: true, // references User.id
  },
  winner_name: {
    type: DataTypes.STRING,
    allowNull: true, // For custom participants (non-group members) who won
  },
  picked_by_name: {
    type: DataTypes.STRING,
    allowNull: true, // For custom participants (non-group members) who picked the game
  },
  custom_participants: {
    type: DataTypes.JSONB,
    allowNull: true, // Array of { username, score, faction, is_new_player, placement }
    defaultValue: [],
  },
  is_group_win: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  comments: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('scheduled', 'in_progress', 'completed', 'cancelled'),
    defaultValue: 'completed',
  },
  rsvp_deadline: {
    type: DataTypes.DATE,
    allowNull: true, // required only when ballot exists, enforced at API level
  },
  ballot_status: {
    type: DataTypes.ENUM('open', 'closed'),
    allowNull: true,
    defaultValue: null, // null = no ballot on this event
  },
}, {
  timestamps: true,
  indexes: [
    {
      fields: ['group_id']
    },
    {
      fields: ['group_id', 'start_date']
    }
  ]
});


module.exports = Event;