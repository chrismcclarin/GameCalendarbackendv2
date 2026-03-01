// migrations/20260228000001-create-group-invites-table.js
// Creates GroupInvites table for consent-based group membership invitations
const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

async function up() {
  const queryInterface = sequelize.getQueryInterface();

  // Step 1: Check if table already exists (idempotent)
  const tableExists = await queryInterface.describeTable('GroupInvites').catch(() => null);
  if (tableExists) {
    console.log('GroupInvites table already exists, skipping creation.');
  } else {
    // Step 2: Create ENUM type idempotently via raw SQL DO/EXCEPTION block
    // Same pattern as Phase 19 UserGroup status migration
    await sequelize.query(`
      DO $$
      BEGIN
        CREATE TYPE "enum_GroupInvites_status" AS ENUM ('pending', 'accepted', 'declined');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // Step 3: Create GroupInvites table
    await queryInterface.createTable('GroupInvites', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      group_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'Groups',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      invited_email: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      invited_by: {
        type: DataTypes.STRING,
        allowNull: false,
        // References Users.user_id (Auth0 string), not Users.id (UUID)
      },
      token: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      status: {
        type: 'enum_GroupInvites_status',
        defaultValue: 'pending',
        allowNull: false,
      },
      accepted_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    });
    console.log('Created GroupInvites table.');
  }

  // Step 4: Add partial unique index via raw SQL
  // Prevents duplicate pending invites to the same email+group (case-insensitive)
  // Allows re-inviting after a decline since the WHERE clause filters on status='pending'
  await sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "group_invites_pending_unique"
    ON "GroupInvites" ("group_id", LOWER("invited_email"))
    WHERE "status" = 'pending'
  `);
  console.log('Added partial unique index: group_invites_pending_unique');

  // Step 5: Add remaining indexes (idempotent with IF NOT EXISTS)
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS "group_invites_token" ON "GroupInvites" ("token")
  `);
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS "group_invites_invited_email" ON "GroupInvites" ("invited_email")
  `);
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS "group_invites_status" ON "GroupInvites" ("status")
  `);
  console.log('Added indexes on token, invited_email, status.');
}

async function down() {
  const queryInterface = sequelize.getQueryInterface();
  await queryInterface.dropTable('GroupInvites');
  await sequelize.query('DROP TYPE IF EXISTS "enum_GroupInvites_status"');
  console.log('Dropped GroupInvites table and ENUM type.');
}

if (require.main === module) {
  up().then(() => sequelize.close()).catch(err => { console.error(err); process.exit(1); });
}

module.exports = { up, down };
