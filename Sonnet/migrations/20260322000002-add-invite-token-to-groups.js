// migrations/20260322000002-add-invite-token-to-groups.js
// Adds invite_token column to Groups table for QR code invite flow.
const sequelize = require('../config/database');

async function up() {
  const queryInterface = sequelize.getQueryInterface();
  await queryInterface.addColumn('Groups', 'invite_token', {
    type: require('sequelize').DataTypes.STRING(64),
    allowNull: true,
    unique: true,
  });
  console.log('Added invite_token column to Groups table.');
}

async function down() {
  const queryInterface = sequelize.getQueryInterface();
  await queryInterface.removeColumn('Groups', 'invite_token');
  console.log('Removed invite_token column from Groups table.');
}

if (require.main === module) {
  up().then(() => sequelize.close()).catch(err => { console.error(err); process.exit(1); });
}

module.exports = { up, down };
