// models/Friendship.js
// Social graph model: tracks friend requests and friendships between users.
// One-row model: one row per friendship pair (requester sends, addressee receives).
// LEAST/GREATEST compound unique index in migration prevents duplicate pairs.
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Friendship = sequelize.define('Friendship', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  requester_id: {
    type: DataTypes.STRING,
    allowNull: false,
    // Auth0 user_id of the user who sent the friend request
  },
  addressee_id: {
    type: DataTypes.STRING,
    allowNull: false,
    // Auth0 user_id of the user who received the friend request
  },
  status: {
    type: DataTypes.ENUM('pending', 'accepted', 'declined', 'blocked'),
    defaultValue: 'pending',
    allowNull: false,
  },
}, {
  timestamps: true,
  indexes: [
    { fields: ['requester_id'] },
    { fields: ['addressee_id'] },
    { fields: ['status'] },
  ],
});

module.exports = Friendship;
