// migrations/20260218000001-create-email-metrics.js
// Creates email_metrics table for tracking SendGrid delivery events
const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

async function up() {
  const queryInterface = sequelize.getQueryInterface();
  await queryInterface.createTable('email_metrics', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
    sg_message_id: { type: DataTypes.STRING, allowNull: false },
    event_type: { type: DataTypes.STRING(50), allowNull: false },
    email_hash: { type: DataTypes.STRING(64), allowNull: true },
    prompt_id: { type: DataTypes.UUID, allowNull: true },
    occurred_at: { type: DataTypes.DATE, allowNull: false },
    sg_machine_open: { type: DataTypes.BOOLEAN, defaultValue: false }
  });
  await queryInterface.addIndex('email_metrics', ['event_type', 'occurred_at'], { name: 'idx_email_metrics_type_time' });
  await queryInterface.addIndex('email_metrics', ['sg_message_id'], { name: 'idx_email_metrics_message_id' });
  await queryInterface.addIndex('email_metrics', ['prompt_id'], { name: 'idx_email_metrics_prompt_id' });
  console.log('Created email_metrics table with indexes.');
}

async function down() {
  const queryInterface = sequelize.getQueryInterface();
  await queryInterface.dropTable('email_metrics');
}

if (require.main === module) {
  up().then(() => sequelize.close()).catch(err => { console.error(err); process.exit(1); });
}

module.exports = { up, down };
