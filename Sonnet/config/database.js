// config/database.js
const { Sequelize } = require('sequelize');
require('dotenv').config();

let sequelize;

// Railway and many hosting platforms provide DATABASE_URL
// Railway provides POSTGRES_PRIVATE_URL for internal service-to-service connections (no SSL needed)
// Prefer private URL for Railway internal connections
const databaseUrl = process.env.POSTGRES_PRIVATE_URL ||
                    process.env.POSTGRES_URL || 
                    process.env.DATABASE_URL || 
                    process.env.PGDATABASE_URL;

// Log connection info (without sensitive data)
if (databaseUrl) {
  try {
    const urlObj = new URL(databaseUrl);
    console.log(`Database connection info:`);
    console.log(`  Protocol: ${urlObj.protocol}`);
    console.log(`  Host: ${urlObj.hostname}`);
    console.log(`  Port: ${urlObj.port || '5432'}`);
    console.log(`  Database: ${urlObj.pathname.slice(1)}`);
    console.log(`  User: ${urlObj.username || 'not set'}`);
  } catch (e) {
    console.log('Could not parse DATABASE_URL:', e.message);
  }
} else {
  console.log('No DATABASE_URL found, using individual environment variables');
  console.log('Available env vars:', Object.keys(process.env).filter(k => k.includes('DATABASE') || k.includes('POSTGRES')));
}

if (databaseUrl) {
  // Railway PostgreSQL connection configuration
  // Railway services on the same project can communicate internally without SSL
  const isRailway = process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_SERVICE_NAME;
  const isProduction = process.env.NODE_ENV === 'production';
  const isPrivateUrl = databaseUrl === process.env.POSTGRES_PRIVATE_URL;
  
  // Check if DATABASE_URL explicitly requires SSL (contains ?sslmode=)
  const requiresSSL = databaseUrl.includes('sslmode=require') || databaseUrl.includes('ssl=true');
  
  console.log(`Connection settings: Railway=${!!isRailway}, Production=${isProduction}, PrivateURL=${isPrivateUrl}, RequiresSSL=${requiresSSL}`);
  
  // Parse DATABASE_URL for Railway/Heroku-style connection strings
  // Railway internal networking (POSTGRES_PRIVATE_URL) doesn't require SSL
  sequelize = new Sequelize(databaseUrl, {
    dialect: 'postgresql',
    logging: process.env.NODE_ENV === 'test' ? false : (msg) => {
      // Only log non-query messages to avoid spam
      if (!msg.includes('SELECT') && !msg.includes('INSERT') && !msg.includes('UPDATE') && !msg.includes('DELETE')) {
        console.log(msg);
      }
    },
    dialectOptions: {
      // Private URLs (internal Railway networking) don't need SSL
      // Public URLs or explicit SSL requirements do need SSL
      ssl: (isPrivateUrl) ? false : (requiresSSL || (isProduction && !isRailway)) ? {
        require: true,
        rejectUnauthorized: false, // Railway uses self-signed certificates
      } : false,
      connectTimeout: 30000, // Increased timeout for Railway
      // Additional connection options
      application_name: 'boardgame-backend',
    },
    pool: {
      max: 5,
      min: 0,
      acquire: 60000, // Increased for Railway
      idle: 10000,
      evict: 10000, // Check for idle connections
    },
    retry: {
      max: 3, // Retry connection up to 3 times
    },
    // Add query timeout
    query: {
      timeout: 30000,
    },
  });
} else {
  // Fallback to individual environment variables for local development
  const getDatabaseName = () => {
    if (process.env.NODE_ENV === 'test') {
      return process.env.TEST_DB_NAME || 'boardgame_test_db';
    }
    return process.env.DB_NAME || 'boardgame_db';
  };

  // Require database credentials in production
  if (process.env.NODE_ENV === 'production' && (!process.env.DB_USER || !process.env.DB_PASSWORD)) {
    throw new Error('DB_USER and DB_PASSWORD must be set in production environment (or use DATABASE_URL)');
  }

  sequelize = new Sequelize(
    getDatabaseName(),
    process.env.DB_USER || 'postgres',
    process.env.DB_PASSWORD || (process.env.NODE_ENV === 'production' ? '' : 'password'),
    {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      dialect: 'postgresql',
      logging: process.env.NODE_ENV === 'test' ? false : console.log,
      dialectOptions: {
        ssl: false,
        connectTimeout: 10000,
      },
    }
  );
}

module.exports = sequelize;
