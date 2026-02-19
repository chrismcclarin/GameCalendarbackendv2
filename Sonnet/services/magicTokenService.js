// services/magicTokenService.js
// Magic token generation and validation for availability form magic links

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { MagicToken } = require('../models');

// Constants for token configuration
const EXPIRY_HOURS = 24;
const GRACE_PERIOD_MINUTES = 5;
const TOKEN_AUDIENCE = 'availability-form';
const TOKEN_ISSUER = 'nextgamenight.app';

/**
 * Generates a magic link token for a user to access an availability form
 *
 * @param {Object} user - User object with user_id and name
 * @param {Object} prompt - AvailabilityPrompt object with id
 * @returns {Promise<string>} JWT token string
 * @throws {Error} If MAGIC_TOKEN_SECRET is not set
 */
async function generateToken(user, prompt, expiryHours = EXPIRY_HOURS) {
  if (!process.env.MAGIC_TOKEN_SECRET) {
    throw new Error('MAGIC_TOKEN_SECRET environment variable is required');
  }

  // Generate unique token ID (stored as jti claim)
  const tokenId = crypto.randomBytes(32).toString('hex');

  // Calculate expiry timestamp
  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

  // Create JWT with required claims
  // Note: User model has 'username' field, but we use 'name' claim for display
  // Support both: prefer 'name' if provided, fall back to 'username'
  const displayName = user.name || user.username;

  const token = jwt.sign(
    {
      jti: tokenId,
      sub: user.user_id,
      name: displayName,
      prompt_id: prompt.id,
      aud: TOKEN_AUDIENCE,
      iss: TOKEN_ISSUER,
    },
    process.env.MAGIC_TOKEN_SECRET,
    {
      expiresIn: `${expiryHours}h`,
      algorithm: 'HS256'
    }
  );

  // Store token metadata in database
  await MagicToken.create({
    token_id: tokenId,
    user_id: user.user_id,
    prompt_id: prompt.id,
    expires_at: expiresAt,
    status: 'active',
    usage_count: 0
  });

  return token;
}

/**
 * Validates a magic link token
 *
 * @param {string} token - JWT token string
 * @param {string|null} formLoadedAt - ISO timestamp when form was loaded (for grace period)
 * @returns {Promise<Object>} Validation result
 *   - valid: boolean - Whether token is valid
 *   - decoded: Object - Decoded JWT claims (if valid)
 *   - tokenRecord: MagicToken - Database record (if valid)
 *   - reason: string - Failure reason (if invalid): 'invalid_token', 'token_not_found', 'token_revoked', 'token_expired'
 *   - graceUsed: boolean - Whether grace period was applied (if valid)
 */
async function validateToken(token, formLoadedAt = null) {
  try {
    // Verify JWT signature, audience, issuer, and expiry
    const decoded = jwt.verify(token, process.env.MAGIC_TOKEN_SECRET, {
      audience: TOKEN_AUDIENCE,
      issuer: TOKEN_ISSUER,
      algorithms: ['HS256'],
      clockTolerance: 30 // 30 second tolerance for clock skew
    });

    // Look up token in database
    const tokenRecord = await MagicToken.findOne({
      where: { token_id: decoded.jti }
    });

    if (!tokenRecord) {
      return { valid: false, reason: 'token_not_found' };
    }

    if (tokenRecord.status === 'revoked') {
      return { valid: false, reason: 'token_revoked' };
    }

    // Update usage tracking
    await tokenRecord.update({
      last_used_at: new Date(),
      usage_count: tokenRecord.usage_count + 1
    });

    return { valid: true, decoded, tokenRecord };

  } catch (err) {
    // Handle JWT-specific errors
    if (err.name === 'TokenExpiredError') {
      // Check if grace period applies
      return await handleExpiredToken(token, formLoadedAt);
    }

    if (err.name === 'JsonWebTokenError' || err.name === 'NotBeforeError') {
      return { valid: false, reason: 'invalid_token' };
    }

    // Re-throw unexpected errors
    throw err;
  }
}

/**
 * Handles expired token validation with grace period logic
 *
 * Grace period allows form submission if:
 * 1. Form was loaded before token expired
 * 2. Current time is within 5 minutes of token expiry
 *
 * @param {string} token - Expired JWT token
 * @param {string|null} formLoadedAt - ISO timestamp when form was loaded
 * @returns {Promise<Object>} Validation result
 */
async function handleExpiredToken(token, formLoadedAt) {
  // No grace period without form load context
  if (!formLoadedAt) {
    return { valid: false, reason: 'token_expired' };
  }

  // Decode token without verification (already expired)
  const decoded = jwt.decode(token);
  if (!decoded || !decoded.jti) {
    return { valid: false, reason: 'invalid_token' };
  }

  // Look up token record for expiry timestamp
  const tokenRecord = await MagicToken.findOne({
    where: { token_id: decoded.jti }
  });

  if (!tokenRecord) {
    return { valid: false, reason: 'token_not_found' };
  }

  if (tokenRecord.status === 'revoked') {
    return { valid: false, reason: 'token_revoked' };
  }

  // Check grace period conditions
  const now = new Date();
  const expiresAt = new Date(tokenRecord.expires_at);
  const gracePeriodEnd = new Date(expiresAt.getTime() + GRACE_PERIOD_MINUTES * 60 * 1000);
  const formLoadedDate = new Date(formLoadedAt);

  // Grace period applies if:
  // 1. Form was loaded before token expired
  // 2. Current time is within grace period (expiry + 5 minutes)
  if (formLoadedDate < expiresAt && now <= gracePeriodEnd) {
    // Update usage tracking
    await tokenRecord.update({
      last_used_at: now,
      usage_count: tokenRecord.usage_count + 1
    });

    return { valid: true, decoded, tokenRecord, graceUsed: true };
  }

  return { valid: false, reason: 'token_expired' };
}

module.exports = {
  generateToken,
  validateToken,
  // Export constants for testing/configuration visibility
  EXPIRY_HOURS,
  GRACE_PERIOD_MINUTES,
  TOKEN_AUDIENCE,
  TOKEN_ISSUER
};
