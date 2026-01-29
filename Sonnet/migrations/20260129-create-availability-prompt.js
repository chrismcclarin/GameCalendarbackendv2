// migrations/20260129-create-availability-prompt.js
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Create ENUM type first
    await queryInterface.sequelize.query(`
      CREATE TYPE "enum_AvailabilityPrompts_status" AS ENUM ('pending', 'active', 'closed', 'converted');
    `);

    await queryInterface.createTable('AvailabilityPrompts', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      group_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'Groups',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      game_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'Games',
          key: 'id',
        },
        onDelete: 'SET NULL',
      },
      prompt_date: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      deadline: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM('pending', 'active', 'closed', 'converted'),
        allowNull: false,
        defaultValue: 'pending',
      },
      week_identifier: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      created_by_settings_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'GroupPromptSettings',
          key: 'id',
        },
        onDelete: 'SET NULL',
      },
      custom_message: {
        type: Sequelize.TEXT,
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
    await queryInterface.addIndex('AvailabilityPrompts', ['group_id']);
    await queryInterface.addIndex('AvailabilityPrompts', ['status']);
    await queryInterface.addIndex('AvailabilityPrompts', ['deadline']);
    await queryInterface.addIndex('AvailabilityPrompts', ['group_id', 'week_identifier'], {
      unique: true,
      name: 'availability_prompts_group_week_unique'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('AvailabilityPrompts');
    // Drop ENUM type
    await queryInterface.sequelize.query(`
      DROP TYPE IF EXISTS "enum_AvailabilityPrompts_status";
    `);
  }
};
