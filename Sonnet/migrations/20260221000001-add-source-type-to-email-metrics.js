// migrations/20260221000001-add-source-type-to-email-metrics.js
// Adds source_type column to distinguish live SendGrid events from test webhook events
const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

async function up() {
  const queryInterface = sequelize.getQueryInterface();
  await queryInterface.addColumn('email_metrics', 'source_type', {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: null,
    comment: 'sendgrid_live for real events; null for pre-migration rows'
  });
  // Backfill existing rows as unknown (pre-migration, cannot distinguish)
  await queryInterface.sequelize.query(
    `UPDATE email_metrics SET source_type = 'unknown_pre_migration' WHERE source_type IS NULL`
  );
  console.log('Added source_type column to email_metrics.');
}

async function down() {
  const queryInterface = sequelize.getQueryInterface();
  await queryInterface.removeColumn('email_metrics', 'source_type');
}

if (require.main === module) {
  up().then(() => sequelize.close()).catch(err => { console.error(err); process.exit(1); });
}

module.exports = { up, down };
