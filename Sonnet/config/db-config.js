// config/db-config.js
// Sequelize pool configuration presets per environment
// Used as reference; active pool size is controlled by SEQUELIZE_POOL_MAX env var in config/database.js
//
// To run load tests with increased pool:
//   SEQUELIZE_POOL_MAX=20 LOAD_TEST_TARGET=http://localhost:4000 npx artillery run tests/load/availability-pipeline.yml
module.exports = {
  development: {
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  },
  test: {
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  },
  loadtest: {
    // Increased pool for load testing: default max:5 causes p99 spikes at 50 concurrent requests
    // At 50 req/s with max:5, 45 requests wait for a connection (30s acquire timeout = p99 disaster)
    pool: {
      max: 20,
      min: 2,
      acquire: 30000,
      idle: 10000
    }
  },
  production: {
    pool: {
      max: 10,
      min: 2,
      acquire: 30000,
      idle: 10000
    }
  }
};
