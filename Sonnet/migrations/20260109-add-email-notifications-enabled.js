// migrations/20260109-add-email-notifications-enabled.js
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add email_notifications_enabled column to Users table
    // Default to true (users are opted-in by default, can opt-out via profile)
    await queryInterface.addColumn('Users', 'email_notifications_enabled', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
  },

  async down(queryInterface, Sequelize) {
    // Remove email_notifications_enabled column
    await queryInterface.removeColumn('Users', 'email_notifications_enabled');
  }
};
