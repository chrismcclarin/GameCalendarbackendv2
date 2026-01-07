// models/User.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  username: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  user_id: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  google_calendar_token: {
    type: DataTypes.TEXT,
    allowNull: true,
    // Note: In production, consider encrypting this field
  },
  google_calendar_refresh_token: {
    type: DataTypes.TEXT,
    allowNull: true,
    // Note: In production, consider encrypting this field
  },
  google_calendar_enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
}, {
  timestamps: true,
  indexes: [
    {
      fields: ['user_id']
    }
  ]
});

module.exports = User;