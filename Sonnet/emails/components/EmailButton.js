const React = require('react');
const { Button } = require('@react-email/components');

/**
 * Reusable CTA button component for NextGameNight emails.
 * Uses table-based rendering for maximum email client compatibility (including Outlook).
 *
 * @param {Object} props
 * @param {string} props.href - Button link URL (required)
 * @param {React.ReactNode} props.children - Button text
 */
function EmailButton({ href, children }) {
  return React.createElement(
    Button,
    {
      href: href,
      style: buttonStyle,
    },
    children
  );
}

// Inline styles (email clients strip <style> tags)
const buttonStyle = {
  backgroundColor: '#4F46E5',
  borderRadius: '5px',
  color: '#ffffff',
  display: 'inline-block',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif',
  fontSize: '16px',
  fontWeight: 'bold',
  lineHeight: '1.25',
  padding: '12px 24px',
  textAlign: 'center',
  textDecoration: 'none',
};

module.exports = EmailButton;
