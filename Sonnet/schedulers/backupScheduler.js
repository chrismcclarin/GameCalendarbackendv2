// schedulers/backupScheduler.js
// Weekly database backup scheduler using node-cron
const cron = require('node-cron');
const { execFile } = require('child_process');
const path = require('path');

// Weekly schedule: Sunday at 2am UTC
const BACKUP_SCHEDULE = '0 2 * * 0';

const backupScriptPath = path.join(__dirname, '..', 'scripts', 'backup-database.js');

/**
 * Weekly backup job - spawns backup-database.js as a child process
 * so it runs independently and won't crash the server on failure.
 */
const backupJob = cron.schedule(BACKUP_SCHEDULE, () => {
  console.log(`[${new Date().toISOString()}] Starting scheduled database backup...`);

  execFile('node', [backupScriptPath], {
    env: process.env,
    timeout: 600000 // 10 minute timeout
  }, (error, stdout, stderr) => {
    if (stdout) {
      console.log('[backup]', stdout.trim());
    }

    if (stderr) {
      console.error('[backup]', stderr.trim());
    }

    if (error) {
      console.error(`[${new Date().toISOString()}] Scheduled backup failed:`, error.message);
    } else {
      console.log(`[${new Date().toISOString()}] Scheduled backup completed successfully`);
    }
  });
}, {
  scheduled: false,  // Don't start automatically - server.js will call .start()
  timezone: 'UTC'
});

module.exports = { backupJob };
