// migrations/20260402000001-change-tutorial-completed-to-version.js
// Converts tutorial_completed (BOOLEAN) to tutorial_version (INTEGER).
// Existing users with tutorial_completed=true get tutorial_version=1.
// New users default to tutorial_version=0.
const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

async function up() {
  const queryInterface = sequelize.getQueryInterface();

  // 1. Add tutorial_version column
  await queryInterface.addColumn('Users', 'tutorial_version', {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
  });

  // 2. Migrate existing data: tutorial_completed=true -> tutorial_version=1
  await sequelize.query(
    'UPDATE "Users" SET "tutorial_version" = 1 WHERE "tutorial_completed" = true'
  );

  // 3. Remove old tutorial_completed column
  await queryInterface.removeColumn('Users', 'tutorial_completed');

  console.log('Migrated tutorial_completed (BOOLEAN) -> tutorial_version (INTEGER).');
}

async function down() {
  const queryInterface = sequelize.getQueryInterface();

  // 1. Re-add tutorial_completed column
  await queryInterface.addColumn('Users', 'tutorial_completed', {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false,
  });

  // 2. Reverse migrate: tutorial_version >= 1 -> tutorial_completed=true
  await sequelize.query(
    'UPDATE "Users" SET "tutorial_completed" = true WHERE "tutorial_version" >= 1'
  );

  // 3. Remove tutorial_version column
  await queryInterface.removeColumn('Users', 'tutorial_version');

  console.log('Reverted tutorial_version (INTEGER) -> tutorial_completed (BOOLEAN).');
}

if (require.main === module) {
  up().then(() => sequelize.close()).catch(err => { console.error(err); process.exit(1); });
}

module.exports = { up, down };
