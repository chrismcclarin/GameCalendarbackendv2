// utils/phoneValidation.js
// Phone number validation and E.164 normalization using libphonenumber-js
const { parsePhoneNumber } = require('libphonenumber-js');

/**
 * Validate and normalize a phone number to E.164 format
 * Uses libphonenumber-js for country-aware parsing -- regex alone passes
 * invalid numbers like +10000000000, so a real parser is required.
 *
 * @param {string} input - Raw phone number input (e.g. "(555) 867-5309", "+15558675309")
 * @param {string} [defaultCountry='US'] - Default country code for numbers without country prefix
 * @returns {{ valid: boolean, e164?: string, error?: string }}
 */
function validatePhone(input, defaultCountry = 'US') {
  if (!input || !input.trim()) {
    return { valid: false, error: 'Phone number is required' };
  }

  try {
    const phoneNumber = parsePhoneNumber(input, defaultCountry);

    if (!phoneNumber || !phoneNumber.isValid()) {
      return { valid: false, error: 'Invalid phone number' };
    }

    return { valid: true, e164: phoneNumber.format('E.164') };
  } catch (error) {
    return { valid: false, error: 'Could not parse phone number' };
  }
}

module.exports = { validatePhone };
