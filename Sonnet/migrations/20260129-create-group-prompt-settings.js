// migrations/20260129-create-group-prompt-settings.js
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('GroupPromptSettings', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      group_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: {
          model: 'Groups',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      schedule_day_of_week: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      schedule_time: {
        type: Sequelize.TIME,
        allowNull: true,
      },
      schedule_timezone: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'UTC',
      },
      default_deadline_hours: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 72,
      },
      default_token_expiry_hours: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 168,
      },
      min_participants: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      template_name: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      template_config: {
        type: Sequelize.JSONB,
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
    await queryInterface.addIndex('GroupPromptSettings', ['group_id'], {
      unique: true,
      name: 'group_prompt_settings_group_id_unique'
    });
    await queryInterface.addIndex('GroupPromptSettings', ['is_active']);
    await queryInterface.addIndex('GroupPromptSettings', ['schedule_day_of_week', 'schedule_time']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('GroupPromptSettings');
  }
};
