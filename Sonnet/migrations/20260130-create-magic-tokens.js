// migrations/20260130-create-magic-tokens.js
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Create ENUM type first
    await queryInterface.sequelize.query(`
      CREATE TYPE "enum_MagicTokens_status" AS ENUM ('active', 'revoked');
    `);

    await queryInterface.createTable('MagicTokens', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      token_id: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true,
        // The JWT 'jti' claim for lookup
      },
      user_id: {
        type: Sequelize.STRING(255),
        allowNull: false,
        references: {
          model: 'Users',
          key: 'user_id',
        },
        onDelete: 'CASCADE',
      },
      prompt_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'AvailabilityPrompts',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      status: {
        type: Sequelize.ENUM('active', 'revoked'),
        allowNull: false,
        defaultValue: 'active',
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      usage_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      last_used_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    // Create indexes
    await queryInterface.addIndex('MagicTokens', ['token_id'], {
      unique: true,
      name: 'magic_tokens_token_id_unique'
    });
    await queryInterface.addIndex('MagicTokens', ['user_id'], {
      name: 'magic_tokens_user_id'
    });
    await queryInterface.addIndex('MagicTokens', ['prompt_id'], {
      name: 'magic_tokens_prompt_id'
    });
    await queryInterface.addIndex('MagicTokens', ['status'], {
      name: 'magic_tokens_status'
    });
    await queryInterface.addIndex('MagicTokens', ['expires_at'], {
      name: 'magic_tokens_expires_at'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('MagicTokens');
    // Drop ENUM type
    await queryInterface.sequelize.query(`
      DROP TYPE IF EXISTS "enum_MagicTokens_status";
    `);
  }
};
