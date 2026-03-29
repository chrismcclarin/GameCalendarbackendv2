// utils/smsUtils.js
// GSM-7 sanitization utility for SMS messages.
// Strips non-GSM-7 characters from user-supplied strings to prevent
// silent message inflation (emoji, smart quotes -> UCS-2 = 70 char segments).

/**
 * Sanitize a string for GSM-7 SMS encoding.
 * - Returns empty string for null/undefined
 * - Replaces smart quotes with straight ASCII equivalents
 * - Replaces em dash / en dash with hyphen
 * - Strips emoji and other non-GSM-7 characters
 * - Trims whitespace
 *
 * @param {string|null|undefined} str - Input string (typically user-supplied event/group name)
 * @returns {string} Sanitized string safe for GSM-7 encoding
 */
function sanitizeForSms(str) {
  if (str == null) return '';
  if (typeof str !== 'string') return '';

  let result = str;

  // Replace smart double quotes with straight quotes
  result = result.replace(/[\u201C\u201D]/g, '"');

  // Replace smart single quotes / apostrophes with straight apostrophe
  result = result.replace(/[\u2018\u2019]/g, "'");

  // Replace em dash and en dash with hyphen
  result = result.replace(/[\u2013\u2014]/g, '-');

  // Strip emoji and other non-GSM-7 characters.
  // GSM-7 basic character set includes: ASCII printable (0x20-0x7E),
  // plus some Latin-1 Supplement chars used in European languages.
  // We keep: basic ASCII printable, newlines, and common Latin-1 accented chars.
  // eslint-disable-next-line no-control-regex
  result = result.replace(/[^\x20-\x7E\n\r\xA0-\xFF]/g, '');

  // Clean up any double spaces left by stripped characters
  result = result.replace(/\s{2,}/g, ' ');

  return result.trim();
}

module.exports = { sanitizeForSms };
