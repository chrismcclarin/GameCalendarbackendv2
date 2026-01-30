#!/usr/bin/env node
/**
 * Test script for email delivery via SendGrid
 * Usage: node scripts/test-email.js your@email.com
 *
 * Requires: SENDGRID_API_KEY and FROM_EMAIL in .env
 */

require('dotenv').config();

const React = require('react');
const { render } = require('@react-email/render');
const emailService = require('../services/emailService');
const AvailabilityPrompt = require('../emails/AvailabilityPrompt');

async function main() {
  const recipientEmail = process.argv[2];

  if (!recipientEmail) {
    console.error('Usage: node scripts/test-email.js <recipient-email>');
    console.error('Example: node scripts/test-email.js chris@example.com');
    process.exit(1);
  }

  if (!emailService.isConfigured()) {
    console.error('Error: Email service not configured.');
    console.error('Set SENDGRID_API_KEY environment variable in .env');
    process.exit(1);
  }

  console.log('='.repeat(50));
  console.log('NextGameNight Email Test');
  console.log('='.repeat(50));
  console.log('');
  console.log('Recipient:', recipientEmail);
  console.log('From:', process.env.FROM_EMAIL || 'schedule@nextgamenight.app');
  console.log('');

  // Create the React Email component
  const emailComponent = React.createElement(AvailabilityPrompt, {
    recipientName: 'Tester',
    groupName: 'Friday Night Games',
    gameName: 'Wingspan',
    weekDescription: 'this week (Jan 27 - Feb 2)',
    responseDeadline: 'Friday at 5pm',
    formUrl: 'https://nextgamenight.app/availability/test-token-123',
    minPlayers: 3,
    unsubscribeUrl: 'https://nextgamenight.app/unsubscribe/test-user'
  });

  // Render to HTML
  console.log('Rendering email template...');
  let html;
  try {
    html = await render(emailComponent);
    console.log('Template rendered successfully (' + html.length + ' bytes)');
  } catch (err) {
    console.error('Failed to render template:', err.message);
    process.exit(1);
  }

  // Send the email
  console.log('');
  console.log('Sending email via SendGrid...');

  const result = await emailService.send({
    to: recipientEmail,
    subject: '[Test] NextGameNight Availability Prompt',
    html: html,
    text: 'Hey Tester! Friday Night Games is planning a game session for Wingspan! Let us know when you\'re free this week.',
    groupName: 'Friday Night Games',
    replyTo: 'test-reply@example.com'
  });

  console.log('');
  if (result.success) {
    console.log('✓ Email sent successfully!');
    console.log('  Message ID:', result.id || 'n/a');
    console.log('');
    console.log('='.repeat(50));
    console.log('VERIFICATION CHECKLIST');
    console.log('='.repeat(50));
    console.log('');
    console.log('Check your inbox (and spam folder) for:');
    console.log('');
    console.log('  [ ] Email arrived');
    console.log('  [ ] Subject: "[Test] NextGameNight Availability Prompt"');
    console.log('  [ ] From: "Friday Night Games via NextGameNight"');
    console.log('  [ ] Greeting: "Hey Tester!"');
    console.log('  [ ] Shows game: Wingspan');
    console.log('  [ ] Shows min players: 3');
    console.log('  [ ] CTA button: "When Can You Play?"');
    console.log('  [ ] Footer with unsubscribe link');
    console.log('');
  } else {
    console.error('✗ Email send failed:', result.error);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
