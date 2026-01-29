// migrations/20260129-create-availability-response.js
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('AvailabilityResponses', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
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
      user_id: {
        type: Sequelize.STRING,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'user_id',
        },
        onDelete: 'CASCADE',
      },
      time_slots: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      user_timezone: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      submitted_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      magic_token_used: {
        type: Sequelize.STRING,
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
    await queryInterface.addIndex('AvailabilityResponses', ['prompt_id']);
    await queryInterface.addIndex('AvailabilityResponses', ['user_id']);
    await queryInterface.addIndex('AvailabilityResponses', ['prompt_id', 'user_id'], {
      unique: true,
      name: 'availability_responses_prompt_user_unique'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('AvailabilityResponses');
  }
};
