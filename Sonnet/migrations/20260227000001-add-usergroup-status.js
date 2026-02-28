// migrations/20260227000001-add-usergroup-status.js
// Adds status ENUM column to UserGroups for invite/accept/decline flow
const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

async function up() {
  const queryInterface = sequelize.getQueryInterface();

  // Step 1: Create ENUM type idempotently via raw SQL
  // queryInterface.addColumn with ENUM fails if the type doesn't exist yet,
  // so we create it explicitly first using DO/EXCEPTION for idempotency.
  await sequelize.query(`
    DO $$
    BEGIN
      CREATE TYPE "enum_UserGroups_status" AS ENUM ('invited', 'active', 'declined');
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

  // Step 2: Add column if it doesn't already exist
  const tableDescription = await queryInterface.describeTable('UserGroups');
  if (!tableDescription.status) {
    await queryInterface.addColumn('UserGroups', 'status', {
      type: DataTypes.ENUM('invited', 'active', 'declined'),
      defaultValue: 'active',
      allowNull: false,
    });
    console.log('Added status column to UserGroups.');
  } else {
    console.log('status column already exists on UserGroups, skipping.');
  }

  // Step 3: Backfill any rows that might have null status (safety net)
  await sequelize.query(
    `UPDATE "UserGroups" SET status = 'active' WHERE status IS NULL`
  );
  console.log('Backfill complete: all existing rows have status = active.');
}

async function down() {
  const queryInterface = sequelize.getQueryInterface();
  await queryInterface.removeColumn('UserGroups', 'status');
  await sequelize.query('DROP TYPE IF EXISTS "enum_UserGroups_status"');
}

if (require.main === module) {
  up().then(() => sequelize.close()).catch(err => { console.error(err); process.exit(1); });
}

module.exports = { up, down };
