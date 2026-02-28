// migrations/20260227000003-add-feedback-page-context.js
// Adds page_context column to feedback table for contextual feedback tracking
const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

async function up() {
  const queryInterface = sequelize.getQueryInterface();

  // Check if column already exists (idempotent)
  // Note: table name is lowercase 'feedback' (explicit tableName in model)
  const tableDescription = await queryInterface.describeTable('feedback');
  if (!tableDescription.page_context) {
    await queryInterface.addColumn('feedback', 'page_context', {
      type: DataTypes.STRING(500),
      allowNull: true,
      defaultValue: null,
    });
    console.log('Added page_context column to feedback.');
  } else {
    console.log('page_context column already exists on feedback, skipping.');
  }
}

async function down() {
  const queryInterface = sequelize.getQueryInterface();
  await queryInterface.removeColumn('feedback', 'page_context');
}

if (require.main === module) {
  up().then(() => sequelize.close()).catch(err => { console.error(err); process.exit(1); });
}

module.exports = { up, down };
