// migrations/20260227000002-make-event-game-id-nullable.js
// Makes Events.game_id nullable so events can be created without a game
const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

async function up() {
  const queryInterface = sequelize.getQueryInterface();

  // Check current column state for idempotency
  const tableDescription = await queryInterface.describeTable('Events');
  if (tableDescription.game_id && tableDescription.game_id.allowNull === true) {
    console.log('game_id is already nullable on Events, skipping.');
    return;
  }

  // Change column to allow null values
  // Existing events with game_id values are untouched
  await queryInterface.changeColumn('Events', 'game_id', {
    type: DataTypes.UUID,
    allowNull: true,
  });
  console.log('Changed game_id to nullable on Events.');
}

async function down() {
  const queryInterface = sequelize.getQueryInterface();
  // NOTE: This down() would fail if any rows have null game_id.
  // In practice this is a one-way migration.
  await queryInterface.changeColumn('Events', 'game_id', {
    type: DataTypes.UUID,
    allowNull: false,
  });
}

if (require.main === module) {
  up().then(() => sequelize.close()).catch(err => { console.error(err); process.exit(1); });
}

module.exports = { up, down };
