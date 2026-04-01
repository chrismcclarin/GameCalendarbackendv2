'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('EventBrings', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      event_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'Events',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      user_id: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      game_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'Games',
          key: 'id',
        },
        onDelete: 'CASCADE',
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

    // Individual indexes for common query patterns
    await queryInterface.addIndex('EventBrings', ['event_id'], {
      name: 'event_brings_event_id',
    });
    await queryInterface.addIndex('EventBrings', ['user_id'], {
      name: 'event_brings_user_id',
    });

    // Unique composite: same user can't bring the same game to the same event twice
    // But multiple users CAN bring the same game (per BRING-04)
    await queryInterface.addIndex('EventBrings', ['event_id', 'user_id', 'game_id'], {
      name: 'event_brings_event_user_game_unique',
      unique: true,
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('EventBrings');
  },
};
