// migrations/20260209000001-add-auto-schedule-fields.js
// Adds auto_schedule_enabled to AvailabilityPrompts and tentative_calendar_event_ids to AvailabilitySuggestions

'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add auto_schedule_enabled to AvailabilityPrompts
    // When true, auto-creates event from best suggestion when deadline passes
    await queryInterface.addColumn('AvailabilityPrompts', 'auto_schedule_enabled', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });

    // Add tentative_calendar_event_ids to AvailabilitySuggestions
    // Maps user_id to Google Calendar event ID for tentative holds
    // Format: {"user_id_1": "calendar_event_id_1", ...}
    await queryInterface.addColumn('AvailabilitySuggestions', 'tentative_calendar_event_ids', {
      type: Sequelize.JSONB,
      allowNull: true,
      defaultValue: null
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('AvailabilitySuggestions', 'tentative_calendar_event_ids');
    await queryInterface.removeColumn('AvailabilityPrompts', 'auto_schedule_enabled');
  }
};
