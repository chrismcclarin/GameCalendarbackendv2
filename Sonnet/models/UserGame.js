// models/UserGame.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const UserGame = sequelize.define('UserGame', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  game_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
}, {
  timestamps: true,
  indexes: [
    {
      fields: ['user_id']
    },
    {
      fields: ['user_id', 'game_id'],
      unique: true
    }
  ]
});

module.exports = UserGame;





