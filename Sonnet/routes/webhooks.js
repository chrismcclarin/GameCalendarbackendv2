// routes/webhooks.js
// Webhook handlers for external service callbacks (Resend delivery events)
const express = require('express');
const crypto = require('crypto');
const router = express.Router();

/**
 * Verify Resend webhook signature using HMAC-SHA256
 * @param {Object} req - Express request object
 * @returns {boolean} True if signature is valid
 */
function verifyResendSignature(req) {
  const signature = req.headers['resend-signature'];
  const secret = process.env.RESEND_WEBHOOK_SECRET;

  // Reject if secret not configured (security requirement)
  if (!secret) {
    console.warn('RESEND_WEBHOOK_SECRET not configured. Rejecting webhook.');
    return false;
  }

  // Reject if signature header missing
  if (!signature) {
    console.warn('Missing resend-signature header on webhook request.');
    return false;
  }

  try {
    // Compute expected signature
    const payload = JSON.stringify(req.body);
    const expected = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    // Constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  } catch (error) {
    console.error('Error verifying webhook signature:', error.message);
    return false;
  }
}

/**
 * Handle Resend webhook events
 * Events: email.sent, email.delivered, email.bounced, email.delivery_delayed, email.complained
 *
 * POST /api/webhooks/resend
 */
router.post('/resend', express.json(), (req, res) => {
  // Verify signature first (CRITICAL for security)
  if (!verifyResendSignature(req)) {
    console.warn('Webhook signature verification failed.');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const { type, data } = req.body;

  // Log event based on type
  // These logs are admin-only visibility (console/server logs)
  switch (type) {
    case 'email.sent':
      console.log(`[Resend] Email sent - ID: ${data?.email_id}, To: ${maskEmail(data?.to)}`);
      break;

    case 'email.delivered':
      console.log(`[Resend] Email delivered - ID: ${data?.email_id}, To: ${maskEmail(data?.to)}`);
      break;

    case 'email.bounced':
      console.error(`[Resend] Email bounced - ID: ${data?.email_id}, To: ${maskEmail(data?.to)}, Reason: ${data?.bounce?.message || 'Unknown'}`);
      // TODO: In future phases, mark email address as invalid in database
      break;

    case 'email.delivery_delayed':
      console.warn(`[Resend] Email delivery delayed - ID: ${data?.email_id}, To: ${maskEmail(data?.to)}`);
      break;

    case 'email.complained':
      console.warn(`[Resend] Spam complaint received - ID: ${data?.email_id}, To: ${maskEmail(data?.to)}`);
      // TODO: In future phases, unsubscribe user from email notifications
      break;

    default:
      console.log(`[Resend] Unknown event type: ${type}`);
  }

  // Always return 200 to acknowledge receipt (prevents Resend retries)
  res.status(200).json({ received: true });
});

/**
 * Mask email address for privacy in logs
 * example@domain.com -> e***e@d***.com
 */
function maskEmail(email) {
  if (!email) return 'unknown';

  try {
    const [local, domain] = email.split('@');
    if (!local || !domain) return 'invalid';

    const maskedLocal = local.length > 2
      ? `${local[0]}***${local[local.length - 1]}`
      : `${local[0]}***`;

    const domainParts = domain.split('.');
    const maskedDomain = domainParts[0].length > 2
      ? `${domainParts[0][0]}***`
      : `${domainParts[0][0]}*`;

    return `${maskedLocal}@${maskedDomain}.${domainParts.slice(1).join('.')}`;
  } catch (error) {
    return 'unknown';
  }
}

module.exports = router;
