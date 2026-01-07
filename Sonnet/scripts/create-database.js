// scripts/create-database.js
const { Sequelize } = require('sequelize');
require('dotenv').config();

const DB_USER = process.env.DB_USER || 'postgres';
const DB_PASSWORD = process.env.DB_PASSWORD || 'password';
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT || 5432;
const DB_NAME = process.env.DB_NAME || 'boardgame_db';

// Connect to postgres database (not the target database) to create it
const adminSequelize = new Sequelize('postgres', DB_USER, DB_PASSWORD, {
  host: DB_HOST,
  port: DB_PORT,
  dialect: 'postgresql',
  logging: false,
  dialectOptions: {
    ssl: false,
    connectTimeout: 10000,
  },
});

async function createDatabase() {
  try {
    console.log('🔌 Connecting to PostgreSQL...');
    await adminSequelize.authenticate();
    console.log('✅ Connected successfully.\n');

    // Check if database exists
    const [results] = await adminSequelize.query(
      `SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'`
    );

    if (results.length > 0) {
      console.log(`ℹ️  Database '${DB_NAME}' already exists.`);
    } else {
      console.log(`📦 Creating database '${DB_NAME}'...`);
      await adminSequelize.query(`CREATE DATABASE ${DB_NAME}`);
      console.log(`✅ Database '${DB_NAME}' created successfully!`);
    }

    await adminSequelize.close();
    console.log('\n🎉 Database setup complete!');
    console.log(`You can now run: npm run seed`);
  } catch (error) {
    console.error('❌ Error creating database:', error.message);
    if (error.original) {
      console.error('Original error:', error.original.message);
    }
    console.error('\nPlease check:');
    console.error('1. PostgreSQL is running');
    console.error('2. Database credentials in .env are correct');
    process.exit(1);
  }
}

createDatabase();

