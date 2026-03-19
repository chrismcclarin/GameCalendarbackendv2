// models/Game.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');


const Game = sequelize.define('Game', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  bgg_id: {
    type: DataTypes.INTEGER,
    allowNull: true, // null for custom games
    unique: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  year_published: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  min_players: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  max_players: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  playing_time: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  weight: {
    type: DataTypes.DECIMAL(4, 2),
    allowNull: true, // BGG average weight/complexity (scale 1.0 to 5.0)
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  image_url: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  thumbnail_url: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  is_custom: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  theme: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  url: {
    type: DataTypes.STRING,
    allowNull: true,
  },
}, {
  timestamps: true,
  indexes: [
    {
      fields: ['name']
    }
  ]
});


module.exports = Game;