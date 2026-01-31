// models/TokenAnalytics.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TokenAnalytics = sequelize.define('TokenAnalytics', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  token_id: {
    type: DataTypes.STRING,
    allowNull: true,
    // JWT 'jti' claim - may be null if token is malformed/unparseable
  },
  validation_success: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    // Whether the token validation succeeded
  },
  failure_reason: {
    type: DataTypes.STRING(50),
    allowNull: true,
    // One of: 'invalid_token', 'token_not_found', 'token_expired', 'token_revoked'
  },
  ip_address: {
    type: DataTypes.STRING(45),
    allowNull: true,
    // Request IP for security analysis (45 chars = max IPv6 length)
  },
  user_agent: {
    type: DataTypes.STRING(500),
    allowNull: true,
    // Browser user agent string
  },
  grace_period_used: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    // Whether validation used expiry grace period
  },
  timestamp: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    // When the validation attempt occurred
  },
}, {
  timestamps: false, // Using explicit timestamp field
  indexes: [
    {
      fields: ['timestamp'],
      name: 'token_analytics_timestamp_idx'
    },
    {
      fields: ['validation_success'],
      name: 'token_analytics_success_idx'
    },
    {
      fields: ['failure_reason'],
      name: 'token_analytics_reason_idx'
    },
    {
      fields: ['timestamp', 'validation_success'],
      name: 'token_analytics_dashboard_idx'
    }
  ]
});

module.exports = TokenAnalytics;
