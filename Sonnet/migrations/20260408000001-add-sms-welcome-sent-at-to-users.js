// migrations/20260408000001-add-sms-welcome-sent-at-to-users.js
// Adds nullable sms_welcome_sent_at TIMESTAMP column to Users.
// Used to ensure the CTIA-required SMS welcome/opt-in confirmation message
// is sent exactly once per user (idempotent across preference re-saves).
const sequelize = require('../config/database');

async function up() {
  const queryInterface = sequelize.getQueryInterface();
  const { DataTypes } = require('sequelize');

  // Idempotent: only add the column if it doesn't already exist
  const tableDescription = await queryInterface.describeTable('Users');
  if (tableDescription.sms_welcome_sent_at) {
    console.log('Column sms_welcome_sent_at already exists on Users. Skipping.');
    return;
  }

  await queryInterface.addColumn('Users', 'sms_welcome_sent_at', {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: null,
  });
  console.log('Added sms_welcome_sent_at column to Users.');
}

async function down() {
  const queryInterface = sequelize.getQueryInterface();
  await queryInterface.removeColumn('Users', 'sms_welcome_sent_at');
  console.log('Dropped sms_welcome_sent_at column from Users.');
}

if (require.main === module) {
  up().then(() => sequelize.close()).catch(err => { console.error(err); process.exit(1); });
}

module.exports = { up, down };
