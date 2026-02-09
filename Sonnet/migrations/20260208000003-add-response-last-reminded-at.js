'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add last_reminded_at column to AvailabilityResponses
    // Timestamp of last reminder email sent to this user for this prompt
    await queryInterface.addColumn('AvailabilityResponses', 'last_reminded_at', {
      type: Sequelize.DATE,
      allowNull: true
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('AvailabilityResponses', 'last_reminded_at');
  }
};
