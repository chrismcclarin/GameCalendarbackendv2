#!/usr/bin/env node
// scripts/backup-database.js
// Standalone pg_dump backup script with retention and Sentry alerting
// Usage: node scripts/backup-database.js

require('dotenv').config();
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Database URL priority matches config/database.js
const DATABASE_URL = process.env.POSTGRES_PRIVATE_URL ||
                     process.env.POSTGRES_URL ||
                     process.env.DATABASE_URL;

// Backup directory: configurable via env, defaults to ~/nextgamenight-backups
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(os.homedir(), 'nextgamenight-backups');

// Retention: keep backups from the last 4 weeks
const RETENTION_DAYS = 28;

/**
 * Generate a timestamped filename for the backup
 */
function getBackupFilename() {
  const now = new Date();
  const timestamp = now.toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '-')
    .replace(/\.\d+Z$/, '');
  return `backup-${timestamp}.sql`;
}

/**
 * Remove backup files older than RETENTION_DAYS
 */
function cleanOldBackups() {
  const cutoff = Date.now() - (RETENTION_DAYS * 24 * 60 * 60 * 1000);
  let removed = 0;

  try {
    const files = fs.readdirSync(BACKUP_DIR);
    for (const file of files) {
      if (!file.startsWith('backup-') || !file.endsWith('.sql')) continue;

      const filePath = path.join(BACKUP_DIR, file);
      const stat = fs.statSync(filePath);

      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(filePath);
        removed++;
        console.log(`Removed old backup: ${file}`);
      }
    }
  } catch (err) {
    console.error('Error cleaning old backups:', err.message);
  }

  return removed;
}

/**
 * Main backup function
 */
function runBackup() {
  if (!DATABASE_URL) {
    const msg = 'No database URL found. Set POSTGRES_PRIVATE_URL, POSTGRES_URL, or DATABASE_URL.';
    console.error(msg);
    process.exit(1);
  }

  // Ensure backup directory exists
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const filename = getBackupFilename();
  const filePath = path.join(BACKUP_DIR, filename);

  console.log(`Starting database backup...`);
  console.log(`  Directory: ${BACKUP_DIR}`);
  console.log(`  Filename:  ${filename}`);

  try {
    // Run pg_dump and write to file
    const output = execSync(
      `pg_dump "${DATABASE_URL}" --no-owner --no-privileges`,
      {
        encoding: 'utf8',
        maxBuffer: 100 * 1024 * 1024, // 100MB max buffer
        timeout: 300000 // 5 minute timeout
      }
    );

    fs.writeFileSync(filePath, output, 'utf8');

    const stat = fs.statSync(filePath);
    const sizeMB = (stat.size / (1024 * 1024)).toFixed(2);

    console.log(`Backup complete: ${filePath} (${sizeMB} MB)`);

    // Clean old backups
    const removed = cleanOldBackups();
    if (removed > 0) {
      console.log(`Cleaned ${removed} old backup(s) (>${RETENTION_DAYS} days)`);
    }

    process.exit(0);
  } catch (err) {
    console.error('Backup failed:', err.message);

    // Report to Sentry if available
    if (process.env.SENTRY_DSN) {
      try {
        const Sentry = require('@sentry/node');
        Sentry.init({
          dsn: process.env.SENTRY_DSN,
          environment: process.env.NODE_ENV || 'development'
        });
        Sentry.captureException(new Error(`Database backup failed: ${err.message}`));
        // Flush Sentry events before exiting
        Sentry.close(2000).then(() => {
          process.exit(1);
        });
        return; // Don't exit immediately -- wait for Sentry flush
      } catch (sentryErr) {
        console.error('Sentry reporting failed:', sentryErr.message);
      }
    }

    process.exit(1);
  }
}

runBackup();
