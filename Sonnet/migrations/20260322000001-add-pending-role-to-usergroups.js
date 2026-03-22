// migrations/20260322000001-add-pending-role-to-usergroups.js
// Adds 'pending' value to the enum_UserGroups_role ENUM type.
// NOTE: ALTER TYPE ... ADD VALUE is non-transactional in PostgreSQL and cannot
// be rolled back. The down() migration logs a warning instead of attempting removal.
const sequelize = require('../config/database');

async function up() {
  // ADD VALUE IF NOT EXISTS is idempotent -- safe to re-run
  await sequelize.query(
    `ALTER TYPE "enum_UserGroups_role" ADD VALUE IF NOT EXISTS 'pending';`
  );
  console.log('Added pending value to enum_UserGroups_role.');
}

async function down() {
  // PostgreSQL cannot remove individual ENUM values without recreating the type.
  // Leaving 'pending' in the ENUM is harmless -- unused values have no side effects.
  console.log('NOTE: pending value remains in enum_UserGroups_role (PostgreSQL cannot remove ENUM values easily).');
}

if (require.main === module) {
  up().then(() => sequelize.close()).catch(err => { console.error(err); process.exit(1); });
}

module.exports = { up, down };
