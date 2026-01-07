// models/GameReview.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');


const GameReview = sequelize.define('GameReview', {
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
  game_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  rating: {
    type: DataTypes.DECIMAL(3, 1), // Allows 0.0 to 5.0 with 0.5 increments
    allowNull: true,
    validate: {
      isInRange(value) {
        if (value !== null && value !== undefined) {
          const num = parseFloat(value);
          if (isNaN(num) || num < 0 || num > 5) {
            throw new Error('Rating must be between 0 and 5');
          }
        }
      }
    },
  },
  review_text: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  is_recommended: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
  },
}, {
  timestamps: true,
  indexes: [
    {
      fields: ['user_id', 'group_id', 'game_id'],
      unique: true
    }
  ]
});


module.exports = GameReview;