// migrations/20260130-create-token-analytics.js
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('TokenAnalytics', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      token_id: {
        type: Sequelize.STRING(255),
        allowNull: true,
        // JWT 'jti' claim - may be null if token is malformed/unparseable
      },
      validation_success: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        // Whether the token validation succeeded
      },
      failure_reason: {
        type: Sequelize.STRING(50),
        allowNull: true,
        // One of: 'invalid_token', 'token_not_found', 'token_expired', 'token_revoked'
      },
      ip_address: {
        type: Sequelize.STRING(45),
        allowNull: true,
        // Request IP for security analysis (45 chars = max IPv6 length)
      },
      user_agent: {
        type: Sequelize.STRING(500),
        allowNull: true,
        // Browser user agent string
      },
      grace_period_used: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        // Whether validation used expiry grace period
      },
      timestamp: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
        // When the validation attempt occurred
      },
    });

    // Create indexes for dashboard queries
    await queryInterface.addIndex('TokenAnalytics', ['timestamp'], {
      name: 'token_analytics_timestamp_idx'
    });
    await queryInterface.addIndex('TokenAnalytics', ['validation_success'], {
      name: 'token_analytics_success_idx'
    });
    await queryInterface.addIndex('TokenAnalytics', ['failure_reason'], {
      name: 'token_analytics_reason_idx'
    });
    await queryInterface.addIndex('TokenAnalytics', ['timestamp', 'validation_success'], {
      name: 'token_analytics_dashboard_idx'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('TokenAnalytics');
  }
};
