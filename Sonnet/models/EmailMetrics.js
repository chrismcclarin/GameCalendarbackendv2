// models/EmailMetrics.js
// Tracks SendGrid email engagement events for monitoring dashboard
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const EmailMetrics = sequelize.define('EmailMetrics', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  sg_message_id: {
    type: DataTypes.STRING,
    allowNull: false
  },
  event_type: {
    type: DataTypes.STRING(50),
    allowNull: false
    // Values: 'open', 'click', 'delivered', 'bounce', 'spamreport', 'dropped'
  },
  email_hash: {
    type: DataTypes.STRING(64),
    allowNull: true
    // SHA-256 of email address for GDPR-safe attribution
  },
  prompt_id: {
    type: DataTypes.UUID,
    allowNull: true
    // Extracted from SendGrid custom_args.prompt_id — null if not set
  },
  occurred_at: {
    type: DataTypes.DATE,
    allowNull: false
  },
  sg_machine_open: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
    // Machine opens (Apple MPP, security gateways) must NOT be counted in open rate
  },
  source_type: {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: null
    // 'sendgrid_live' for real production events
    // 'unknown_pre_migration' for rows created before this migration
  }
}, {
  tableName: 'email_metrics',
  timestamps: false, // Use occurred_at as the event timestamp
  indexes: [
    { fields: ['event_type', 'occurred_at'] },
    { fields: ['sg_message_id'] },
    { fields: ['prompt_id'] }
  ]
});

module.exports = EmailMetrics;
