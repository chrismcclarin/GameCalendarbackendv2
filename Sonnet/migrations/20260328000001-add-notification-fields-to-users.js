// migrations/20260328000001-add-notification-fields-to-users.js
// Adds phone, sms_enabled, and notification_preferences columns to Users table
// for SMS notification infrastructure.
const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

async function up() {
  const queryInterface = sequelize.getQueryInterface();

  // Add phone column (E.164 format, max 15 digits + '+')
  await queryInterface.addColumn('Users', 'phone', {
    type: DataTypes.STRING(20),
    allowNull: true,
    defaultValue: null,
  });
  console.log('Added phone column to Users table.');

  // Add sms_enabled flag (default false for new signups)
  await queryInterface.addColumn('Users', 'sms_enabled', {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  });
  console.log('Added sms_enabled column to Users table.');

  // Backfill existing users to sms_enabled=true (GATE-01: existing users opted in)
  await sequelize.query('UPDATE "Users" SET sms_enabled = true');
  console.log('Backfilled sms_enabled=true for all existing users.');

  // Add notification_preferences JSONB column (null = use defaults)
  await queryInterface.addColumn('Users', 'notification_preferences', {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: null,
  });
  console.log('Added notification_preferences column to Users table.');
}

async function down() {
  const queryInterface = sequelize.getQueryInterface();

  await queryInterface.removeColumn('Users', 'notification_preferences');
  console.log('Removed notification_preferences column from Users table.');

  await queryInterface.removeColumn('Users', 'sms_enabled');
  console.log('Removed sms_enabled column from Users table.');

  await queryInterface.removeColumn('Users', 'phone');
  console.log('Removed phone column from Users table.');
}

if (require.main === module) {
  up().then(() => sequelize.close()).catch(err => { console.error(err); process.exit(1); });
}

module.exports = { up, down };
