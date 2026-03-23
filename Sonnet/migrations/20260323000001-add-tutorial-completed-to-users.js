// migrations/20260323000001-add-tutorial-completed-to-users.js
// Adds tutorial_completed boolean column to Users table for onboarding tutorial tracking.
const sequelize = require('../config/database');

async function up() {
  const queryInterface = sequelize.getQueryInterface();
  await queryInterface.addColumn('Users', 'tutorial_completed', {
    type: require('sequelize').DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false,
  });
  console.log('Added tutorial_completed column to Users table.');
}

async function down() {
  const queryInterface = sequelize.getQueryInterface();
  await queryInterface.removeColumn('Users', 'tutorial_completed');
  console.log('Removed tutorial_completed column from Users table.');
}

if (require.main === module) {
  up().then(() => sequelize.close()).catch(err => { console.error(err); process.exit(1); });
}

module.exports = { up, down };
