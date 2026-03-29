// migrations/20260329100001-create-sent-notifications.js
// Creates SentNotifications table to track outbound SMS notifications
// for inbound reply-to-event resolution in Phase 51.
const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

async function up() {
  const queryInterface = sequelize.getQueryInterface();

  // Step 1: Check if table already exists (idempotent)
  const tableExists = await queryInterface.describeTable('SentNotifications').catch(() => null);
  if (tableExists) {
    console.log('SentNotifications table already exists, skipping creation.');
  } else {
    // Step 2: Create SentNotifications table
    await queryInterface.createTable('SentNotifications', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      user_id: {
        type: DataTypes.STRING,
        allowNull: false,
        // Auth0 string ID, not UUID -- matches EventRsvps pattern
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
      phone: {
        type: DataTypes.STRING(20),
        allowNull: false,
        // E.164 format for reverse lookup by inbound webhook
      },
      channel: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'sms',
      },
      notification_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      twilio_sid: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      sent_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    });
    console.log('Created SentNotifications table.');
  }

  // Step 3: Add indexes (idempotent with IF NOT EXISTS)
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS "sent_notifications_phone_sent_at"
    ON "SentNotifications" ("phone", "sent_at")
  `);
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS "sent_notifications_user_event"
    ON "SentNotifications" ("user_id", "event_id")
  `);
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS "sent_notifications_event_id"
    ON "SentNotifications" ("event_id")
  `);
  console.log('Added indexes on [phone, sent_at], [user_id, event_id], and [event_id].');
}

async function down() {
  const queryInterface = sequelize.getQueryInterface();
  await queryInterface.dropTable('SentNotifications');
  console.log('Dropped SentNotifications table.');
}

if (require.main === module) {
  up().then(() => sequelize.close()).catch(err => { console.error(err); process.exit(1); });
}

module.exports = { up, down };
