// migrations/20260227000004-create-friendships-table.js
// Creates the Friendships table for the social graph (Phase 21 foundation).
// One-row model: one row per friendship pair, LEAST/GREATEST unique index prevents duplicates.
const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

async function up() {
  const queryInterface = sequelize.getQueryInterface();
  const tables = await queryInterface.showAllTables();

  if (tables.includes('Friendships')) {
    console.log('Friendships table already exists, skipping.');
    return;
  }

  // Create ENUM type for friendship status (idempotent via DO/EXCEPTION block)
  await sequelize.query(`
    DO $$
    BEGIN
      CREATE TYPE "enum_Friendships_status" AS ENUM ('pending', 'accepted', 'declined', 'blocked');
    EXCEPTION
      WHEN duplicate_object THEN
        RAISE NOTICE 'enum_Friendships_status already exists, skipping.';
    END
    $$;
  `);

  // Create the Friendships table
  await queryInterface.createTable('Friendships', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    requester_id: {
      type: DataTypes.STRING,
      allowNull: false,
      // Auth0 user_id format (e.g., 'auth0|abc123' or 'google-oauth2|123')
    },
    addressee_id: {
      type: DataTypes.STRING,
      allowNull: false,
      // Auth0 user_id format
    },
    status: {
      type: '"enum_Friendships_status"',
      allowNull: false,
      defaultValue: 'pending',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  });

  // Compound unique index: LEAST/GREATEST prevents duplicate pairs regardless of direction
  // If A sends to B, B cannot also send to A -- the normalization catches it
  await sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "friendships_pair_unique"
      ON "Friendships" (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
  `);

  // Per-column indexes for efficient lookups
  await queryInterface.addIndex('Friendships', ['requester_id'], {
    name: 'friendships_requester_id',
  });
  await queryInterface.addIndex('Friendships', ['addressee_id'], {
    name: 'friendships_addressee_id',
  });
  await queryInterface.addIndex('Friendships', ['status'], {
    name: 'friendships_status',
  });

  console.log('Created Friendships table with indexes.');
}

async function down() {
  const queryInterface = sequelize.getQueryInterface();
  await queryInterface.dropTable('Friendships');
  await sequelize.query('DROP TYPE IF EXISTS "enum_Friendships_status";');
  console.log('Dropped Friendships table and enum type.');
}

if (require.main === module) {
  up().then(() => sequelize.close()).catch(err => { console.error(err); process.exit(1); });
}

module.exports = { up, down };
