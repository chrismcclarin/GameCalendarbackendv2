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
      console.log('⚠️  WARNING: Running in production mode.');
      console.log('⚠️  This script will use sync({ alter: false }) which only creates missing tables.');
      console.log('⚠️  For production, use proper migrations instead.');
      
      // Only create tables if they don't exist (safe)
      await sequelize.sync({ alter: false });
      console.log('✅ Database tables synchronized (missing tables created).');
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


