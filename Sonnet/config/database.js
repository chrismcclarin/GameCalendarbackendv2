// config/database.js
const { Sequelize } = require('sequelize');
require('dotenv').config();

// Determine which database to use based on environment
const getDatabaseName = () => {
  if (process.env.NODE_ENV === 'test') {
    return process.env.TEST_DB_NAME || 'boardgame_test_db';
  }
  return process.env.DB_NAME || 'boardgame_db';
};

// Require database credentials in production
if (process.env.NODE_ENV === 'production' && (!process.env.DB_USER || !process.env.DB_PASSWORD)) {
  throw new Error('DB_USER and DB_PASSWORD must be set in production environment');
}

const sequelize = new Sequelize(
  getDatabaseName(),
  process.env.DB_USER || 'postgres',
  process.env.DB_PASSWORD || (process.env.NODE_ENV === 'production' ? '' : 'password'),
  {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgresql',
    logging: process.env.NODE_ENV === 'test' ? false : console.log,
    dialectOptions: {
      // PostgreSQL 18 compatibility
      ssl: false,
      connectTimeout: 10000,
    },
  }
);

module.exports = sequelize;
