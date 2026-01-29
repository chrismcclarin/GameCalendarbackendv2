// migrations/20260129-create-availability-suggestion.js
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('AvailabilitySuggestions', {
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
      suggested_start: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      suggested_end: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      participant_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      participant_user_ids: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      preferred_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      meets_minimum: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      score: {
        type: Sequelize.FLOAT,
        allowNull: false,
        defaultValue: 0,
      },
      converted_to_event_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'Events',
          key: 'id',
        },
        onDelete: 'SET NULL',
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
    await queryInterface.addIndex('AvailabilitySuggestions', ['prompt_id']);
    await queryInterface.addIndex('AvailabilitySuggestions', ['meets_minimum']);
    await queryInterface.addIndex('AvailabilitySuggestions', ['score']);
    await queryInterface.addIndex('AvailabilitySuggestions', ['suggested_start', 'suggested_end']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('AvailabilitySuggestions');
  }
};
