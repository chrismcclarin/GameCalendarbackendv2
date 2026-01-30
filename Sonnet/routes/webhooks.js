// routes/webhooks.js
// Webhook handlers for external service callbacks (SendGrid delivery events)
const express = require('express');
const crypto = require('crypto');
const router = express.Router();

/**
 * Verify SendGrid webhook signature using ECDSA
 * SendGrid uses the x-twilio-email-event-webhook-signature header
 * @param {string} publicKey - SendGrid verification key from dashboard
 * @param {string} payload - Raw request body as string
 * @param {string} signature - Signature from header
 * @param {string} timestamp - Timestamp from header
 * @returns {boolean} True if signature is valid
 */
function verifySendGridSignature(publicKey, payload, signature, timestamp) {
  if (!publicKey || !signature || !timestamp) {
    return false;
  }

  try {
    const timestampPayload = timestamp + payload;
    const decodedSignature = Buffer.from(signature, 'base64');

    const verifier = crypto.createVerify('sha256');
    verifier.update(timestampPayload);

    return verifier.verify(
      {
        key: publicKey,
        format: 'pem',
        type: 'spki'
      },
      decodedSignature
    );
  } catch (error) {
    console.error('Error verifying SendGrid webhook signature:', error.message);
    return false;
  }
}

/**
 * Handle SendGrid webhook events
 * Events: delivered, bounce, dropped, deferred, open, click, spam_report, unsubscribe, etc.
 *
 * POST /api/webhooks/sendgrid
 */
router.post('/sendgrid', express.json(), (req, res) => {
  const publicKey = process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY;
  const signature = req.headers['x-twilio-email-event-webhook-signature'];
  const timestamp = req.headers['x-twilio-email-event-webhook-timestamp'];

  // Verify signature if verification key is configured
  if (publicKey) {
    const payload = JSON.stringify(req.body);
    if (!verifySendGridSignature(publicKey, payload, signature, timestamp)) {
      console.warn('SendGrid webhook signature verification failed.');
      return res.status(401).json({ error: 'Invalid signature' });
    }
  } else {
    // Log warning but allow through in development (for testing)
    if (process.env.NODE_ENV === 'production') {
      console.warn('SENDGRID_WEBHOOK_VERIFICATION_KEY not configured. Rejecting webhook in production.');
      return res.status(401).json({ error: 'Webhook verification not configured' });
    }
    console.warn('SENDGRID_WEBHOOK_VERIFICATION_KEY not configured. Allowing webhook in development.');
  }

  // SendGrid sends an array of events
  const events = Array.isArray(req.body) ? req.body : [req.body];

  events.forEach((event) => {
    const { event: eventType, email, sg_message_id, reason } = event;

    // Log event based on type
    // These logs are admin-only visibility (console/server logs)
    switch (eventType) {
      case 'processed':
        console.log(`[SendGrid] Email processed - ID: ${sg_message_id}, To: ${maskEmail(email)}`);
        break;

      case 'delivered':
        console.log(`[SendGrid] Email delivered - ID: ${sg_message_id}, To: ${maskEmail(email)}`);
        break;

      case 'bounce':
        console.error(`[SendGrid] Email bounced - ID: ${sg_message_id}, To: ${maskEmail(email)}, Reason: ${reason || 'Unknown'}`);
        // TODO: In future phases, mark email address as invalid in database
        break;

      case 'dropped':
        console.error(`[SendGrid] Email dropped - ID: ${sg_message_id}, To: ${maskEmail(email)}, Reason: ${reason || 'Unknown'}`);
        break;

      case 'deferred':
        console.warn(`[SendGrid] Email deferred - ID: ${sg_message_id}, To: ${maskEmail(email)}`);
        break;

      case 'spamreport':
        console.warn(`[SendGrid] Spam report received - ID: ${sg_message_id}, To: ${maskEmail(email)}`);
        // TODO: In future phases, unsubscribe user from email notifications
        break;

      case 'unsubscribe':
        console.warn(`[SendGrid] Unsubscribe request - ID: ${sg_message_id}, To: ${maskEmail(email)}`);
        // TODO: In future phases, update user preferences
        break;

      case 'open':
        console.log(`[SendGrid] Email opened - ID: ${sg_message_id}, To: ${maskEmail(email)}`);
        break;

      case 'click':
        console.log(`[SendGrid] Link clicked - ID: ${sg_message_id}, To: ${maskEmail(email)}`);
        break;

      default:
        console.log(`[SendGrid] Event: ${eventType} - ID: ${sg_message_id}`);
    }
  });

  // Always return 200 to acknowledge receipt (prevents SendGrid retries)
  res.status(200).json({ received: true, count: events.length });
});

// Keep Resend endpoint for backward compatibility (can be removed later)
router.post('/resend', express.json(), (req, res) => {
  console.warn('[Webhooks] Received request to deprecated /resend endpoint. Use /sendgrid instead.');
  res.status(200).json({ received: true, deprecated: true });
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
