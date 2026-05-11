// migrations/20260511000001-change-user-timezone-default-to-null.js
// Phase 78 / TZ-01: Change Users.timezone column default from 'UTC' to null.
//
// IMPORTANT: This migration ONLY changes the column DEFAULT for FUTURE inserts.
// Existing rows are intentionally NOT touched — the user has already manually
// corrected production data so each existing row reflects the user's actual
// timezone (per Phase 78 CONTEXT.md "Out of scope: Backfilling existing 'UTC' rows").
//
// Rationale: null becomes the sentinel for "never set" so the rest of Phase 78
// (78-02 backend persistence + 78-03 frontend Intl detection) can cleanly
// distinguish "never set" (null) from "explicitly chosen 'UTC'" (string 'UTC').
// Without this default flip, every new signup that omits `timezone` would land
// as 'UTC' and silently look identical to a real UTC user.
//
// Reversible: down() restores defaultValue 'UTC' so rollback is safe.
const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

async function up() {
  const queryInterface = sequelize.getQueryInterface();
  await queryInterface.changeColumn('Users', 'timezone', {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: null,
  });
  console.log("Changed Users.timezone column default from 'UTC' to null.");
}

async function down() {
  const queryInterface = sequelize.getQueryInterface();
  await queryInterface.changeColumn('Users', 'timezone', {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'UTC',
  });
  console.log("Reverted Users.timezone column default to 'UTC'.");
}

if (require.main === module) {
  up().then(() => sequelize.close()).catch(err => { console.error(err); process.exit(1); });
}

module.exports = { up, down };
