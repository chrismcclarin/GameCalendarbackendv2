// models/SchedulerRun.js
// Records one row per scheduler tick for health telemetry and silent-failure
// detection. Phase 61 / MAIL-01: each registered scheduler wraps its work in
// schedulerHealthService.recordRun() which inserts a row here on every tick
// (success or failure). The anomaly detector queries this table to alert when
// historically-non-zero jobs go silent.
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SchedulerRun = sequelize.define('SchedulerRun', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
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
}, {
  timestamps: true,
  indexes: [
    {
      // Anomaly query: SELECT last N runs of job ordered by ran_at DESC
      fields: ['job_name', 'ran_at'],
    },
  ],
});

module.exports = SchedulerRun;
