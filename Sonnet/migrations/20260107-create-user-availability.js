// migrations/20260107-create-user-availability.js
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('UserAvailabilities', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
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
      type: {
        type: Sequelize.ENUM('recurring_pattern', 'specific_override'),
        allowNull: false,
      },
      pattern_data: {
        type: Sequelize.JSONB,
        allowNull: false,
      },
      start_date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      end_date: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      is_available: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
      },
      timezone: {
        type: Sequelize.STRING,
        allowNull: true,
        defaultValue: 'UTC',
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
    await queryInterface.addIndex('UserAvailabilities', ['user_id']);
    await queryInterface.addIndex('UserAvailabilities', ['type']);
    await queryInterface.addIndex('UserAvailabilities', ['start_date', 'end_date']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('UserAvailabilities');
  }
};

