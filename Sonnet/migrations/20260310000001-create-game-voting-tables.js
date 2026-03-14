// migrations/20260310000001-create-game-voting-tables.js
// Creates EventBallotOptions and EventBallotVotes tables, adds rsvp_deadline and ballot_status to Events
const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

async function up() {
  const queryInterface = sequelize.getQueryInterface();

  // Step 1: Add rsvp_deadline column to Events table (idempotent)
  await sequelize.query(`
    ALTER TABLE "Events" ADD COLUMN IF NOT EXISTS "rsvp_deadline" TIMESTAMP WITH TIME ZONE
  `);
  console.log('Added rsvp_deadline column to Events (or already exists).');

  // Step 2: Create ballot_status ENUM type idempotently, then add column
  await sequelize.query(`
    DO $$
    BEGIN
      CREATE TYPE "enum_Events_ballot_status" AS ENUM ('open', 'closed');
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await sequelize.query(`
    ALTER TABLE "Events" ADD COLUMN IF NOT EXISTS "ballot_status" "enum_Events_ballot_status"
  `);
  console.log('Added ballot_status column to Events (or already exists).');

  // Step 3: Create EventBallotOptions table if not exists
  const optionsTableExists = await queryInterface.describeTable('EventBallotOptions').catch(() => null);
  if (optionsTableExists) {
    console.log('EventBallotOptions table already exists, skipping creation.');
  } else {
    await queryInterface.createTable('EventBallotOptions', {
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
      game_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'Games',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      game_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      display_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
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
    console.log('Created EventBallotOptions table.');
  }

  // Step 4: Create EventBallotVotes table if not exists
  const votesTableExists = await queryInterface.describeTable('EventBallotVotes').catch(() => null);
  if (votesTableExists) {
    console.log('EventBallotVotes table already exists, skipping creation.');
  } else {
    await queryInterface.createTable('EventBallotVotes', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      option_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'EventBallotOptions',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      user_id: {
        type: DataTypes.STRING,
        allowNull: false,
        // Auth0 string ID, not UUID -- matches EventRsvp/UserGroup pattern
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
    console.log('Created EventBallotVotes table.');
  }

  // Step 5: Add indexes (idempotent with IF NOT EXISTS)
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS "event_ballot_options_event_id" ON "EventBallotOptions" ("event_id")
  `);
  await sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "event_ballot_options_event_game_name_unique"
    ON "EventBallotOptions" ("event_id", "game_name")
  `);
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS "event_ballot_votes_option_id" ON "EventBallotVotes" ("option_id")
  `);
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS "event_ballot_votes_user_id" ON "EventBallotVotes" ("user_id")
  `);
  await sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "event_ballot_votes_option_user_unique"
    ON "EventBallotVotes" ("option_id", "user_id")
  `);
  console.log('Added indexes on EventBallotOptions and EventBallotVotes.');
}

async function down() {
  const queryInterface = sequelize.getQueryInterface();

  // Drop tables (cascade drops indexes)
  await queryInterface.dropTable('EventBallotVotes');
  await queryInterface.dropTable('EventBallotOptions');

  // Remove columns from Events
  await queryInterface.removeColumn('Events', 'ballot_status').catch(() => null);
  await queryInterface.removeColumn('Events', 'rsvp_deadline').catch(() => null);

  // Drop ENUM type
  await sequelize.query('DROP TYPE IF EXISTS "enum_Events_ballot_status"');

  console.log('Dropped ballot tables, Events columns, and ENUM type.');
}

if (require.main === module) {
  up().then(() => sequelize.close()).catch(err => { console.error(err); process.exit(1); });
}

module.exports = { up, down };
