// models/Group.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Group = sequelize.define('Group', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  group_id: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  profile_picture_url: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  background_color: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: '#ffffff', // Default white
  },
  background_image_url: {
    type: DataTypes.STRING,
    allowNull: true,
  },
}, {
  timestamps: true,
  indexes: [
    {
      fields: ['group_id']
    }
  ]
});

module.exports = Group;