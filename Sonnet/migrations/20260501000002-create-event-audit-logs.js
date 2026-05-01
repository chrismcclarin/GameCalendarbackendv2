// migrations/20260501000002-create-event-audit-logs.js
// Creates EventAuditLogs table to capture an internal audit row on every
// event delete (regardless of whether cancellation emails were sent). Lets
// support answer "where did my event go?" without mystery. (Phase 61, MAIL-05)
//
// Design notes:
// - No FK constraints on event_id / group_id: the parent event row is destroyed
//   in the same request that writes this log, so we want the audit row to
//   survive as an orphan (this is the whole point).
// - actor_user_id is STRING (Auth0 user_id), matching the convention used by
//   UserGroup, EventRsvp, MagicToken, and SentNotification.
// - event_snapshot is JSONB so we can preserve enough context to answer the
//   support question without joining anywhere.
const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

async function up() {
  const queryInterface = sequelize.getQueryInterface();

  // Step 1: Idempotency guard
  const tableExists = await queryInterface.describeTable('EventAuditLogs').catch(() => null);
  if (tableExists) {
    console.log('EventAuditLogs table already exists, skipping creation.');
  } else {
    await queryInterface.createTable('EventAuditLogs', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      event_id: {
        type: DataTypes.UUID,
        allowNull: false,
        // No FK -- we keep the orphan log when the event is destroyed.
      },
      group_id: {
        type: DataTypes.UUID,
        allowNull: false,
        // No FK -- same reason; group may also be deleted later.
      },
      actor_user_id: {
        type: DataTypes.STRING,
        allowNull: false,
        // Auth0 string ID (e.g., "google-oauth2|107459289778553956693").
      },
      action: {
        type: DataTypes.STRING,
        allowNull: false,
        // Currently only 'delete'. Reserved for future actions like 'force_cancel'.
      },
      was_after_start: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
      },
      was_within_15min_grace: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
      },
      suppressed_email: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
      },
      event_snapshot: {
        type: DataTypes.JSONB,
        allowNull: false,
        // { id, group_id, game_id, start_date, duration_minutes, location, comments }
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    });
    console.log('Created EventAuditLogs table.');
  }

  // Step 2: Indexes (idempotent)
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS "event_audit_logs_group_created"
    ON "EventAuditLogs" ("group_id", "created_at" DESC)
  `);
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS "event_audit_logs_event_id"
    ON "EventAuditLogs" ("event_id")
  `);
  console.log('Added indexes on [group_id, created_at DESC] and [event_id].');
}

async function down() {
  const queryInterface = sequelize.getQueryInterface();
  await queryInterface.dropTable('EventAuditLogs');
  console.log('Dropped EventAuditLogs table.');
}

if (require.main === module) {
  up().then(() => sequelize.close()).catch(err => { console.error(err); process.exit(1); });
}

module.exports = { up, down };
