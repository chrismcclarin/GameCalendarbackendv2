// scripts/run-migrations.js
// Helper script to run database migrations
// Usage: node scripts/run-migrations.js

const { sequelize } = require('../models');
require('dotenv').config();

async function runMigrations() {
  try {
    console.log('Connecting to database...');
    await sequelize.authenticate();
    console.log('Database connection established.');

    // In production, you should use Sequelize migrations
    // For now, this script can be used to sync schema if needed
    // WARNING: Only use in development or for initial setup
    
    if (process.env.NODE_ENV === 'production') {
      // In production, never call sequelize.sync() — it runs ALTER TABLE without IF NOT EXISTS
      // and will fail if any column was added via a manual migration first.
      // Schema is managed by migrations; just verify the connection is live.
      console.log('Production mode: DB connection verified. Skipping sync (use migrations for schema changes).');
    } else {
      // Development: Use sync for convenience
      await sequelize.sync({ alter: false });
      console.log('✅ Development database synchronized.');
    }

    console.log('Migration complete.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigrations();


