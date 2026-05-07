// migrations/20260507000005-restrict-week-uniqueness-to-auto.js
//
// Phase 71.2 / Plan 01 hotfix #2 — convert the legacy
// availability_prompts_group_week_unique index from a full unique constraint
// on (group_id, week_identifier) into a PARTIAL one that only applies to
// auto-prompts.
//
// Original index intent: dedupe auto-prompts so the recurring-schedule cron
// doesn't fire two prompts for the same (group, week). That intent is correct
// for auto-prompts and should be preserved.
//
// Bug exposed by 71.2: the full constraint also blocks MANUAL polls (created
// by humans via POST /prompts). After a user closes a manual poll, they cannot
// start another one in the same ISO week because the closed row still owns
// the (group_id, week_identifier) tuple.
//
// Fix: scope the index to created_by_user_id IS NULL — i.e. auto-prompts and
// legacy rows. Manual polls (created_by_user_id NOT NULL) can stack freely
// within a week; the OPEN-poll cap is already enforced by the separate
// availability_prompts_one_open_manual index from 20260507000004.
const sequelize = require('../config/database');

async function up() {
  await sequelize.query('DROP INDEX IF EXISTS "availability_prompts_group_week_unique";');
  console.log('Dropped legacy availability_prompts_group_week_unique.');

  await sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "availability_prompts_auto_group_week_unique"
    ON "AvailabilityPrompts" ("group_id", "week_identifier")
    WHERE "created_by_user_id" IS NULL AND "week_identifier" IS NOT NULL
  `);
  console.log('Created availability_prompts_auto_group_week_unique (partial — auto-prompts only).');
}

async function down() {
  await sequelize.query('DROP INDEX IF EXISTS "availability_prompts_auto_group_week_unique";');
  await sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "availability_prompts_group_week_unique"
    ON "AvailabilityPrompts" ("group_id", "week_identifier")
  `);
}

if (require.main === module) {
  up().then(() => sequelize.close()).catch(err => { console.error(err); process.exit(1); });
}

module.exports = { up, down };
