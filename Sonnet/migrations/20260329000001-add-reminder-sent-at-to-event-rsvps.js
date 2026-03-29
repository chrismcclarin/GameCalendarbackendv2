'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('EventRsvps', 'reminder_sent_at', {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null
    });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('EventRsvps', 'reminder_sent_at');
  }
};
