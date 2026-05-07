// migrations/20260507000004-tighten-prompt-manual-uniqueness.js
//
// Phase 71.2 / Plan 01 hotfix — tighten the "one open manual poll per group"
// partial unique index discriminator.
//
// Bug: the original index in 20260507000002 used WHERE created_by_settings_id IS NULL,
// which incorrectly catches LEGACY rows (pre-71.2 prompts with NULL on BOTH
// created_by_user_id AND created_by_settings_id). Those zombie rows block new
// manual polls in the affected groups.
//
// Fix: switch the discriminator to created_by_user_id IS NOT NULL — that's the
// real "this is a manual poll" signal. Auto-prompts have NULL here (created via
// recurring schedule, no human creator). Legacy rows also have NULL here, so
// they correctly fall outside the constraint.
//
// Mirrors the executable-script shape used by other Phase 50+ migrations.
const sequelize = require('../config/database');

async function up() {
  // Drop the old, incorrectly-scoped index.
  await sequelize.query('DROP INDEX IF EXISTS "availability_prompts_one_open_manual";');
  console.log('Dropped old availability_prompts_one_open_manual.');

  // Recreate with the correct manual-poll discriminator.
  await sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "availability_prompts_one_open_manual"
    ON "AvailabilityPrompts" ("group_id")
    WHERE "created_by_user_id" IS NOT NULL AND "status" IN ('pending', 'active')
  `);
  console.log('Recreated availability_prompts_one_open_manual with created_by_user_id IS NOT NULL.');
}

async function down() {
  // Reverse: restore the original (incorrectly-scoped) index. Down path exists
  // for symmetry; you should not run this in production.
  await sequelize.query('DROP INDEX IF EXISTS "availability_prompts_one_open_manual";');
  await sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "availability_prompts_one_open_manual"
    ON "AvailabilityPrompts" ("group_id")
    WHERE "created_by_settings_id" IS NULL AND "status" IN ('pending', 'active')
  `);
}

if (require.main === module) {
  up().then(() => sequelize.close()).catch(err => { console.error(err); process.exit(1); });
}

module.exports = { up, down };
