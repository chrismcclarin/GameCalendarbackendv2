// middleware/magicTokenAuth.js
// Magic token verification middleware for availability form magic links

const { validateToken } = require('../services/magicTokenService');

/**
 * Magic token verification middleware
 * Validates token from query param or body and attaches decoded info to req.magicToken
 *
 * Similar to auth0.js verifyAuth0Token, but for magic link tokens.
 *
 * On success: attaches req.magicToken with decoded claims and token record
 * On failure: returns generic error message (security - don't reveal failure reason)
 */
async function verifyMagicToken(req, res, next) {
  const token = req.body.token || req.query.token;
  const formLoadedAt = req.body.formLoadedAt; // ISO string from frontend

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const result = await validateToken(token, formLoadedAt);

    if (!result.valid) {
      // Generic error for security (per CONTEXT.md)
      // Don't reveal whether token was expired, revoked, or invalid
      return res.status(400).json({
        error: 'This link is no longer valid.',
        action: 'request_new'
      });
    }

    // Attach to request for downstream use
    req.magicToken = {
      decoded: result.decoded,
      tokenRecord: result.tokenRecord,
      graceUsed: result.graceUsed || false
    };

    next();

  } catch (err) {
    console.error('Magic token verification error:', err);
    return res.status(500).json({ error: 'Validation failed' });
  }
}

module.exports = { verifyMagicToken };
