const React = require('react');
const {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Link,
  Preview,
} = require('@react-email/components');

/**
 * Shared email layout wrapper for all NextGameNight emails.
 * Provides consistent branding, structure, and footer.
 *
 * @param {Object} props
 * @param {string} props.preview - Inbox preview text (appears before opening)
 * @param {React.ReactNode} props.children - Email body content
 * @param {string} [props.groupName] - Group name for footer attribution
 * @param {string} [props.unsubscribeUrl] - Link to unsubscribe from prompts
 */
function EmailLayout({ preview, children, groupName, unsubscribeUrl }) {
  return React.createElement(
    Html,
    null,
    React.createElement(Head, null),
    React.createElement(Preview, null, preview),
    React.createElement(
      Body,
      { style: bodyStyle },
      React.createElement(
        Container,
        { style: containerStyle },
        // Main content section
        React.createElement(
          Section,
          { style: contentStyle },
          children
        ),
        // Footer section
        React.createElement(
          Section,
          { style: footerStyle },
          React.createElement(
            Text,
            { style: footerTextStyle },
            groupName
              ? `Sent by NextGameNight on behalf of ${groupName}`
              : 'Sent by NextGameNight'
          ),
          unsubscribeUrl && React.createElement(
            Text,
            { style: footerTextStyle },
            React.createElement(
              Link,
              { href: unsubscribeUrl, style: unsubscribeLinkStyle },
              'Unsubscribe from these emails'
            )
          )
        )
      )
    )
  );
}

// Inline styles (email clients strip <style> tags)
const bodyStyle = {
  backgroundColor: '#f6f9fc',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif',
  margin: 0,
  padding: '20px 0',
};

const containerStyle = {
  backgroundColor: '#ffffff',
  borderRadius: '8px',
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
  margin: '0 auto',
  maxWidth: '600px',
  padding: '0',
};

const contentStyle = {
  padding: '32px 40px',
};

const footerStyle = {
  borderTop: '1px solid #e5e7eb',
  padding: '20px 40px',
  textAlign: 'center',
};

const footerTextStyle = {
  color: '#6B7280',
  fontSize: '12px',
  lineHeight: '1.5',
  margin: '4px 0',
};

const unsubscribeLinkStyle = {
  color: '#6B7280',
  textDecoration: 'underline',
};

module.exports = EmailLayout;
