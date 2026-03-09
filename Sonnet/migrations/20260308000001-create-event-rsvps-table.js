// migrations/20260308000001-create-event-rsvps-table.js
// Creates EventRsvps table for event RSVP responses (yes/no/maybe with optional note)
const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

async function up() {
  const queryInterface = sequelize.getQueryInterface();

  // Step 1: Check if table already exists (idempotent)
  const tableExists = await queryInterface.describeTable('EventRsvps').catch(() => null);
  if (tableExists) {
    console.log('EventRsvps table already exists, skipping creation.');
  } else {
    // Step 2: Create ENUM type idempotently via raw SQL DO/EXCEPTION block
    await sequelize.query(`
      DO $$
      BEGIN
        CREATE TYPE "enum_EventRsvps_status" AS ENUM ('yes', 'no', 'maybe');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // Step 3: Create EventRsvps table
    await queryInterface.createTable('EventRsvps', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      event_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'Events',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      user_id: {
        type: DataTypes.STRING,
        allowNull: false,
        // Auth0 string ID, not UUID -- matches UserGroup pattern
      },
      status: {
        type: 'enum_EventRsvps_status',
        allowNull: false,
      },
      note: {
        type: DataTypes.TEXT,
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
    console.log('Created EventRsvps table.');
  }

  // Step 4: Add indexes (idempotent with IF NOT EXISTS)
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS "event_rsvps_event_id" ON "EventRsvps" ("event_id")
  `);
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS "event_rsvps_user_id" ON "EventRsvps" ("user_id")
  `);
  await sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "event_rsvps_event_user_unique"
    ON "EventRsvps" ("event_id", "user_id")
  `);
  console.log('Added indexes on event_id, user_id, and unique compound [event_id, user_id].');
}

async function down() {
  const queryInterface = sequelize.getQueryInterface();
  await queryInterface.dropTable('EventRsvps');
  await sequelize.query('DROP TYPE IF EXISTS "enum_EventRsvps_status"');
  console.log('Dropped EventRsvps table and ENUM type.');
}

if (require.main === module) {
  up().then(() => sequelize.close()).catch(err => { console.error(err); process.exit(1); });
}

module.exports = { up, down };
