// models/GroupInvite.js
// Stores group membership invitations with token-based acceptance flow
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const GroupInvite = sequelize.define('GroupInvite', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  group_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  invited_email: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  invited_by: {
    type: DataTypes.STRING,
    allowNull: false,
    // Auth0 user_id of the inviter
  },
  token: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  status: {
    type: DataTypes.ENUM('pending', 'accepted', 'declined'),
    defaultValue: 'pending',
    allowNull: false,
  },
  accepted_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  timestamps: true,
  indexes: [
    // Token lookup (unique is already on the column definition)
    {
      fields: ['token'],
    },
    // Email lookup for pending invites
    {
      fields: ['invited_email'],
    },
    // Status filtering
    {
      fields: ['status'],
    },
    // Partial unique index on (group_id, LOWER(invited_email)) WHERE status='pending'
    // is handled in the migration via raw SQL since Sequelize doesn't support partial indexes
  ],
});

module.exports = GroupInvite;
