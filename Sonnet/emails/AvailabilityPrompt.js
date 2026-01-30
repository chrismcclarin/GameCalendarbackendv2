const React = require('react');
const {
  Section,
  Text,
  Heading,
} = require('@react-email/components');
const EmailLayout = require('./components/EmailLayout');
const EmailButton = require('./components/EmailButton');

/**
 * Email template for weekly availability prompts.
 * Sent to group members to gather their available times for game sessions.
 *
 * Brand guidelines:
 * - Casual, friendly tone
 * - "NextGameNight" branding (not Periodic Table Top)
 * - No images (better deliverability)
 *
 * @param {Object} props
 * @param {string} [props.recipientName='there'] - User's display name
 * @param {string} props.groupName - Name of the group (required)
 * @param {string} [props.gameName] - Specific game being scheduled, if any
 * @param {string} props.weekDescription - e.g., "this week (Jan 27 - Feb 2)"
 * @param {string} props.responseDeadline - e.g., "Thursday at 6pm"
 * @param {string} props.formUrl - Magic link URL to availability form
 * @param {number} [props.minPlayers] - Minimum players needed
 * @param {string} props.unsubscribeUrl - Link to unsubscribe from prompts
 */
function AvailabilityPrompt({
  recipientName = 'there',
  groupName,
  gameName,
  weekDescription,
  responseDeadline,
  formUrl,
  minPlayers,
  unsubscribeUrl,
}) {
  // Build preview text for inbox display
  const previewText = gameName
    ? `Hey! Time to pick when you're free for ${gameName} ${weekDescription || 'this week'}`
    : `Hey! Time to pick when you're free for game night ${weekDescription || 'this week'}`;

  // Build the session description
  const sessionDescription = gameName
    ? `${groupName} is planning a game session for ${gameName}!`
    : `${groupName} is planning a game session!`;

  return React.createElement(
    EmailLayout,
    {
      preview: previewText,
      groupName: groupName,
      unsubscribeUrl: unsubscribeUrl,
    },
    // Greeting with game emoji
    React.createElement(
      Heading,
      { style: headingStyle },
      `Hey ${recipientName}!`
    ),
    // Session announcement
    React.createElement(
      Text,
      { style: paragraphStyle },
      sessionDescription,
      ' Let us know when you\'re free ',
      weekDescription || 'this week',
      '.'
    ),
    // Min players note (if provided)
    minPlayers && React.createElement(
      Text,
      { style: noteStyle },
      `We need at least ${minPlayers} player${minPlayers > 1 ? 's' : ''} to make this happen.`
    ),
    // CTA Button section
    React.createElement(
      Section,
      { style: buttonSectionStyle },
      React.createElement(
        EmailButton,
        { href: formUrl },
        'When Can You Play?'
      )
    ),
    // Deadline reminder
    React.createElement(
      Text,
      { style: paragraphStyle },
      `Please respond by ${responseDeadline} so we can find a time that works for everyone.`
    )
  );
}

// Inline styles (email clients strip <style> tags)
const headingStyle = {
  color: '#111827',
  fontSize: '24px',
  fontWeight: 'bold',
  lineHeight: '1.3',
  margin: '0 0 16px 0',
};

const paragraphStyle = {
  color: '#333333',
  fontSize: '16px',
  lineHeight: '1.6',
  margin: '0 0 16px 0',
};

const noteStyle = {
  backgroundColor: '#f3f4f6',
  borderRadius: '4px',
  color: '#4b5563',
  fontSize: '14px',
  lineHeight: '1.5',
  margin: '0 0 16px 0',
  padding: '12px 16px',
};

const buttonSectionStyle = {
  margin: '24px 0',
  textAlign: 'center',
};

module.exports = AvailabilityPrompt;
