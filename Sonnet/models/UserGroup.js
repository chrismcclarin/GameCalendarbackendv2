// models/UserGroup.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');


const UserGroup = sequelize.define('UserGroup', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  group_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  role: {
    type: DataTypes.ENUM('member', 'admin', 'owner'),
    defaultValue: 'member',
  },
  joined_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  timestamps: true,
  indexes: [
    {
      fields: ['user_id']
    },
    {
      fields: ['user_id', 'group_id'],
      unique: true
    }
  ]
});


module.exports = UserGroup;