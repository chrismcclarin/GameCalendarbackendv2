// migrations/20260322000004-add-is-guest-to-event-participations.js
// Adds is_guest column to EventParticipations table for game-only QR invite participants.
const sequelize = require('../config/database');

async function up() {
  const queryInterface = sequelize.getQueryInterface();
  await queryInterface.addColumn('EventParticipations', 'is_guest', {
    type: require('sequelize').DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false,
  });
  console.log('Added is_guest column to EventParticipations table.');
}

async function down() {
  const queryInterface = sequelize.getQueryInterface();
  await queryInterface.removeColumn('EventParticipations', 'is_guest');
  console.log('Removed is_guest column from EventParticipations table.');
}

if (require.main === module) {
  up().then(() => sequelize.close()).catch(err => { console.error(err); process.exit(1); });
}

module.exports = { up, down };
