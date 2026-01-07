// tests/setup.js
// Load test environment variables
require('dotenv').config({ path: '.env.test' });

// Set NODE_ENV to test
process.env.NODE_ENV = 'test';

const { sequelize } = require('../models');

// Setup before all tests
beforeAll(async () => {
  // Authenticate with test database
  try {
    await sequelize.authenticate();
    console.log('Test database connection established.');
  } catch (error) {
    console.error('Unable to connect to test database:', error);
    throw error;
  }
});

// Clean up after all tests
afterAll(async () => {
  // Close database connection
  await sequelize.close();
});

