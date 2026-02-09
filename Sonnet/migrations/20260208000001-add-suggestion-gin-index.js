'use strict';

/**
 * Migration to add GIN index on AvailabilitySuggestions.participant_user_ids
 *
 * This index enables efficient @> (containment) queries on the JSONB array,
 * allowing O(log n) lookups when filtering suggestions by whether a specific
 * user is in the participant_user_ids array, instead of O(n) sequential scan.
 *
 * Use case: Quickly find all suggestions where a specific user is a participant
 * Example query: WHERE participant_user_ids @> '["auth0|user123"]'::jsonb
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    // GIN index with jsonb_path_ops for efficient @> containment queries
    // jsonb_path_ops is optimized for @> queries and uses less space than full GIN
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_suggestion_participant_ids_gin
      ON "AvailabilitySuggestions"
      USING GIN (participant_user_ids jsonb_path_ops);
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS idx_suggestion_participant_ids_gin;
    `);
  }
};
