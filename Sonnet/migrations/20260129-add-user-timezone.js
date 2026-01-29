// migrations/20260129-add-user-timezone.js
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add timezone column to Users table
    // Default to UTC for existing users, can be updated via user profile
    await queryInterface.addColumn('Users', 'timezone', {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: 'UTC',
    });
  },

  async down(queryInterface, Sequelize) {
    // Remove timezone column
    await queryInterface.removeColumn('Users', 'timezone');
  }
};
