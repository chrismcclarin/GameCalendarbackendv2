// migrations/20260510000001-add-google-calendar-event-id-to-event-participations.js
// Phase 75 / GCAL-01: Adds nullable google_calendar_event_id column to EventParticipations
// so the cleanup path (Plan 75-03) can find which Google Calendar event to remove
// when an event is cancelled, hard-deleted, or an attendee RSVPs no.
// Pre-existing rows stay null (fix-forward only — no backfill per CONTEXT.md).
const sequelize = require('../config/database');

async function up() {
  const queryInterface = sequelize.getQueryInterface();
  await queryInterface.addColumn('EventParticipations', 'google_calendar_event_id', {
    type: require('sequelize').DataTypes.STRING,
    allowNull: true,
  });
  console.log('Added google_calendar_event_id column to EventParticipations table.');
}

async function down() {
  const queryInterface = sequelize.getQueryInterface();
  await queryInterface.removeColumn('EventParticipations', 'google_calendar_event_id');
  console.log('Removed google_calendar_event_id column from EventParticipations table.');
}

if (require.main === module) {
  up().then(() => sequelize.close()).catch(err => { console.error(err); process.exit(1); });
}

module.exports = { up, down };
