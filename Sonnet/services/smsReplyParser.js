'use strict';

/**
 * SMS Reply Parser
 *
 * Pure function that classifies inbound SMS text into:
 * - RSVP status (yes/no/maybe)
 * - Opt-out command
 * - Unknown
 *
 * Priority order (first match wins):
 * 1. STOP/opt-out commands (regulatory compliance - always checked first)
 * 2. Exact number match: 1=yes, 2=no, 3=maybe
 * 3. Exact single-word match (case-insensitive)
 * 4. Keyword extraction from surrounding text (word boundary, left-to-right, yes>no>maybe)
 * 5. Unknown
 */

const OPT_OUT_WORDS = ['stop', 'unsubscribe', 'cancel', 'quit', 'end'];

const NUMBER_MAP = {
  '1': 'yes',
  '2': 'no',
  '3': 'maybe'
};

const YES_WORDS = ['yes', 'y', 'yea', 'yep', 'sure', 'yeah', 'absolutely', 'definitely'];
const NO_WORDS = ['no', 'n', 'nah', 'nope', 'cant', "can't", 'cannot'];
const MAYBE_WORDS = ['maybe', 'm', 'possibly', 'perhaps', 'unsure', 'idk'];

const EXACT_WORD_MAP = {};
YES_WORDS.forEach(w => { EXACT_WORD_MAP[w] = 'yes'; });
NO_WORDS.forEach(w => { EXACT_WORD_MAP[w] = 'no'; });
MAYBE_WORDS.forEach(w => { EXACT_WORD_MAP[w] = 'maybe'; });

// Build keyword regex patterns with word boundaries for extraction
// Each entry: [regex, status] -- order matters for same-position tiebreak
const KEYWORD_PATTERNS = [
  ...YES_WORDS.map(w => [new RegExp(`\\b${w.replace("'", "'")}\\b`, 'i'), 'yes']),
  ...NO_WORDS.map(w => [new RegExp(`\\b${w.replace("'", "'")}\\b`, 'i'), 'no']),
  ...MAYBE_WORDS.map(w => [new RegExp(`\\b${w.replace("'", "'")}\\b`, 'i'), 'maybe']),
];

/**
 * Parse an inbound SMS body and classify it.
 *
 * @param {string} body - Raw SMS body text
 * @returns {{ type: 'rsvp', status: 'yes'|'no'|'maybe' } | { type: 'opt_out' } | { type: 'unknown' }}
 */
function parseReply(body) {
  // Edge case: null/undefined/empty
  if (!body || typeof body !== 'string') {
    return { type: 'unknown' };
  }

  const trimmed = body.trim();
  if (!trimmed) {
    return { type: 'unknown' };
  }

  const lower = trimmed.toLowerCase();

  // 1. Opt-out check (HIGHEST PRIORITY - regulatory compliance)
  for (const word of OPT_OUT_WORDS) {
    const regex = new RegExp(`\\b${word}\\b`, 'i');
    if (regex.test(lower)) {
      return { type: 'opt_out' };
    }
  }

  // 2. Exact number match (trimmed)
  if (NUMBER_MAP[trimmed]) {
    return { type: 'rsvp', status: NUMBER_MAP[trimmed] };
  }

  // 3. Exact single-word match (trimmed, lowered)
  if (EXACT_WORD_MAP[lower]) {
    return { type: 'rsvp', status: EXACT_WORD_MAP[lower] };
  }

  // 4. Keyword extraction -- find earliest match position, left-to-right
  //    For keywords at the same position, priority is yes > no > maybe (due to array order)
  let bestMatch = null;
  let bestIndex = Infinity;

  for (const [regex, status] of KEYWORD_PATTERNS) {
    const match = regex.exec(lower);
    if (match && match.index < bestIndex) {
      bestIndex = match.index;
      bestMatch = status;
    }
  }

  if (bestMatch) {
    return { type: 'rsvp', status: bestMatch };
  }

  // 5. Unknown
  return { type: 'unknown' };
}

module.exports = { parseReply };
