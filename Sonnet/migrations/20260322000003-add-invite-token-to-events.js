// migrations/20260322000003-add-invite-token-to-events.js
// Adds invite_token column to Events table for QR code game invite flow.
const sequelize = require('../config/database');

async function up() {
  const queryInterface = sequelize.getQueryInterface();
  await queryInterface.addColumn('Events', 'invite_token', {
    type: require('sequelize').DataTypes.STRING(64),
    allowNull: true,
    unique: true,
  });
  console.log('Added invite_token column to Events table.');
}

async function down() {
  const queryInterface = sequelize.getQueryInterface();
  await queryInterface.removeColumn('Events', 'invite_token');
  console.log('Removed invite_token column from Events table.');
}

if (require.main === module) {
  up().then(() => sequelize.close()).catch(err => { console.error(err); process.exit(1); });
}

module.exports = { up, down };
