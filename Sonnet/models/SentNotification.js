// models/SentNotification.js
// Tracks outbound SMS notifications for inbound reply-to-event resolution.
// When a user replies to an SMS, the webhook queries this table by phone number
// (ordered by sent_at DESC) to find the most recent event they were notified about.
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SentNotification = sequelize.define('SentNotification', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  user_id: {
    type: DataTypes.STRING,
    allowNull: false,
    // Auth0 string ID (e.g., "google-oauth2|107459289778553956693")
    // NOT UUID -- matches EventRsvp, UserGroup, MagicToken pattern
  },
  event_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Events',
      key: 'id',
    },
    onDelete: 'CASCADE',
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: false,
    // E.164 format for reverse lookup by inbound webhook
  },
  channel: {
    type: DataTypes.STRING(10),
    allowNull: false,
    defaultValue: 'sms',
  },
  notification_type: {
    type: DataTypes.STRING(50),
    allowNull: false,
    // e.g. 'event_created', 'event_updated', 'reminder'
  },
  twilio_sid: {
    type: DataTypes.STRING,
    allowNull: true,
    // Twilio message SID from smsService.send() response
  },
  sent_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  timestamps: false, // sent_at serves as the timestamp
  indexes: [
    {
      // Primary lookup for inbound webhook: find most recent event by phone
      fields: ['phone', 'sent_at'],
    },
    {
      // Audit: which notifications were sent for a user+event combo
      fields: ['user_id', 'event_id'],
    },
    {
      // CASCADE cleanup performance
      fields: ['event_id'],
    },
  ],
});

module.exports = SentNotification;
