// scripts/setup-test-db.js
const { Sequelize } = require('sequelize');
const path = require('path');
const fs = require('fs');

// Load .env.test file
const envTestPath = path.join(__dirname, '..', '.env.test');
if (fs.existsSync(envTestPath)) {
  require('dotenv').config({ path: envTestPath });
} else {
  console.warn('Warning: .env.test file not found, using defaults or system environment variables');
  require('dotenv').config();
}

const DB_USER = process.env.DB_USER || 'postgres';
const DB_PASSWORD = process.env.DB_PASSWORD || 'password';
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT || 5432;
const TEST_DB_NAME = process.env.TEST_DB_NAME || 'boardgame_test_db';

// Connect to postgres database (not the test database) to create it
const adminSequelize = new Sequelize('postgres', DB_USER, DB_PASSWORD, {
  host: DB_HOST,
  port: DB_PORT,
  dialect: 'postgresql',
  logging: false,
  dialectOptions: {
    // PostgreSQL 18 compatibility
    ssl: false,
    // Additional options for PostgreSQL 18
    connectTimeout: 10000,
  },
});

async function setupTestDatabase() {
  try {
    console.log('Connecting to PostgreSQL...');
    await adminSequelize.authenticate();
    console.log('Connected successfully.');

    // Check if test database exists
    const [results] = await adminSequelize.query(
      `SELECT 1 FROM pg_database WHERE datname = '${TEST_DB_NAME}'`
    );

    if (results.length > 0) {
      console.log(`Database '${TEST_DB_NAME}' already exists.`);
      console.log('Terminating active connections...');
      
      // Terminate all connections to the test database
      await adminSequelize.query(`
        SELECT pg_terminate_backend(pg_stat_activity.pid)
        FROM pg_stat_activity
        WHERE pg_stat_activity.datname = '${TEST_DB_NAME}'
        AND pid <> pg_backend_pid();
      `);
      
      console.log('Dropping existing database...');
      await adminSequelize.query(`DROP DATABASE ${TEST_DB_NAME}`);
    }

    console.log(`Creating test database '${TEST_DB_NAME}'...`);
    await adminSequelize.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    console.log(`✅ Test database '${TEST_DB_NAME}' created successfully!`);

    // Close admin connection
    await adminSequelize.close();

    // Set environment for model loading BEFORE requiring models
    process.env.NODE_ENV = 'test';
    process.env.DB_NAME = TEST_DB_NAME;
    
    // Now connect to the test database and sync tables
    // Import models to sync them (this will use the test database)
    const { sequelize } = require('../models');

    console.log('Connecting to test database...');
    await sequelize.authenticate();
    console.log('Connected to test database.');
    
    console.log('Syncing database schema...');
    await sequelize.sync({ force: true });
    console.log('✅ Database schema synced successfully!');

    await sequelize.close();
    console.log('\n🎉 Test database setup complete!');
    console.log(`You can now run tests with: npm test`);
  } catch (error) {
    console.error('❌ Error setting up test database:', error.message);
    if (error.original) {
      console.error('Original error:', error.original.message);
    }
    process.exit(1);
  }
}

setupTestDatabase();

