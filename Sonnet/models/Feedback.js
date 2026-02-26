// models/Feedback.js
// Stores user-submitted bug reports, suggestions, and feature requests
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Feedback = sequelize.define('Feedback', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  type: {
    type: DataTypes.STRING(20),
    allowNull: false,
    // Values: 'bug', 'suggestion', 'feature'
  },
  subject: {
    type: DataTypes.STRING(200),
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  user_email: {
    type: DataTypes.STRING(255),
    allowNull: true,
    // null for anonymous submissions
  },
  user_id: {
    type: DataTypes.STRING,
    allowNull: true,
    // Auth0 user ID, null for anonymous submissions
  },
}, {
  tableName: 'feedback',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    { fields: ['type'] },
    { fields: ['created_at'] },
  ],
});

module.exports = Feedback;
