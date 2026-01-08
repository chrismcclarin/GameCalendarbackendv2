// migrations/20260108-fix-usergroup-user-id-type.js
// Fix UserGroup.user_id to be STRING instead of UUID to support Auth0 user IDs

'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Change user_id column from UUID to VARCHAR to support Auth0 user IDs
    await queryInterface.changeColumn('UserGroups', 'user_id', {
      type: Sequelize.STRING,
      allowNull: false,
    });
  },

  async down(queryInterface, Sequelize) {
    // Revert back to UUID (note: this might fail if there are non-UUID values)
    await queryInterface.changeColumn('UserGroups', 'user_id', {
      type: Sequelize.UUID,
      allowNull: false,
    });
  }
};
