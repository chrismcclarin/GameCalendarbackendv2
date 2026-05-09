// config/sequelize-cli.config.js
// Sequelize-CLI environment config.
// Mirrors the URL precedence chain from config/database.js so CLI commands
// (db:migrate, db:migrate:status, etc.) hit the same DB the runtime does.
//
// Used by:
//   - Local dev: `npx sequelize-cli db:migrate:status`
//   - CI: .github/workflows/migrations-check.yml
//   - Railway pre-deploy step: `npm run migrate:apply`
//
// Do NOT export a `sequelize` instance here — sequelize-cli expects a config object,
// not a live connection. Runtime DB connection lives in config/database.js.

require('dotenv').config();

const databaseUrl =
  process.env.POSTGRES_PRIVATE_URL ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL ||
  process.env.PGDATABASE_URL;

const isProduction = process.env.NODE_ENV === 'production';
const isRailway = !!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_SERVICE_NAME);
const isPrivateUrl = databaseUrl && databaseUrl === process.env.POSTGRES_PRIVATE_URL;
const requiresSSL = databaseUrl && (databaseUrl.includes('sslmode=require') || databaseUrl.includes('ssl=true'));

const sslConfig = isPrivateUrl
  ? false
  : (requiresSSL || (isProduction && !isRailway))
    ? { require: true, rejectUnauthorized: false }
    : false;

const baseConfig = {
  url: databaseUrl,
  dialect: 'postgres',
  dialectOptions: {
    ssl: sslConfig,
  },
};

module.exports = {
  development: baseConfig,
  test: baseConfig,
  production: baseConfig,
};
