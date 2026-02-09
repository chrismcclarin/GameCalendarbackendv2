'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add blind_voting_enabled column
    // When true, heatmap hidden until user submits or deadline passes
    await queryInterface.addColumn('AvailabilityPrompts', 'blind_voting_enabled', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('AvailabilityPrompts', 'blind_voting_enabled');
  }
};
