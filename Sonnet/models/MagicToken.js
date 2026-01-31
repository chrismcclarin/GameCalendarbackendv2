// models/MagicToken.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const MagicToken = sequelize.define('MagicToken', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  token_id: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    // The JWT 'jti' claim for lookup
  },
  user_id: {
    type: DataTypes.STRING,
    allowNull: false,
    // References Users.user_id (Auth0 string ID, not UUID)
    // Association defined in models/index.js with targetKey: 'user_id'
  },
  prompt_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'AvailabilityPrompts',
      key: 'id',
    },
    onDelete: 'CASCADE',
    // Token becomes invalid when prompt is deleted
  },
  status: {
    type: DataTypes.ENUM('active', 'revoked'),
    allowNull: false,
    defaultValue: 'active',
    // active: token can be used
    // revoked: token was manually invalidated (e.g., user requested new link)
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: false,
    // When token becomes invalid (24h from creation)
  },
  usage_count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    // Tracks validation attempts for analytics
  },
  last_used_at: {
    type: DataTypes.DATE,
    allowNull: true,
    // Most recent validation timestamp
  },
}, {
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['token_id'],
      name: 'magic_tokens_token_id_unique'
    },
    {
      fields: ['user_id'],
      name: 'magic_tokens_user_id'
    },
    {
      fields: ['prompt_id'],
      name: 'magic_tokens_prompt_id'
    },
    {
      fields: ['status'],
      name: 'magic_tokens_status'
    },
    {
      fields: ['expires_at'],
      name: 'magic_tokens_expires_at'
    }
  ]
});

module.exports = MagicToken;
