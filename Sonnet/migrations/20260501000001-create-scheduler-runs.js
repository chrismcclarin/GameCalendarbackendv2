// migrations/20260501000001-create-scheduler-runs.js
// Creates SchedulerRuns table to record per-tick health telemetry for all
// background schedulers (reminder, deadline, auto_promotion, backup, prompt_sync).
// Used by services/schedulerHealthService.js to persist sent/skipped counts and
// detect zero-output anomalies (the silent-failure bug Phase 61 is fixing).
const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

async function up() {
  const queryInterface = sequelize.getQueryInterface();

  // Idempotent: skip if already created
  const tableExists = await queryInterface.describeTable('SchedulerRuns').catch(() => null);
  if (tableExists) {
    console.log('SchedulerRuns table already exists, skipping creation.');
  } else {
    await queryInterface.createTable('SchedulerRuns', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      job_name: {
        type: DataTypes.STRING,
        allowNull: false,
        // e.g. 'reminder', 'deadline', 'auto_promotion', 'backup', 'prompt_sync'
      },
      sent_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      skipped_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      error: {
        type: DataTypes.TEXT,
        allowNull: true,
        // Stores error.message when a scheduler tick throws
      },
      duration_ms: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      ran_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    });
    console.log('Created SchedulerRuns table.');
  }

  // Index for fast anomaly queries (lookup last N runs per job)
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS "scheduler_runs_job_name_ran_at"
    ON "SchedulerRuns" ("job_name", "ran_at" DESC)
  `);
  console.log('Added index on (job_name, ran_at DESC).');
}

async function down() {
  const queryInterface = sequelize.getQueryInterface();
  await queryInterface.dropTable('SchedulerRuns');
  console.log('Dropped SchedulerRuns table.');
}

if (require.main === module) {
  up().then(() => sequelize.close()).catch(err => { console.error(err); process.exit(1); });
}

module.exports = { up, down };
