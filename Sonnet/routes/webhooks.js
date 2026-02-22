// routes/webhooks.js
// Webhook handlers for external service callbacks (SendGrid delivery events)
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { EmailMetrics } = require('../models');

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

    // Wrap in PEM headers if the key is raw base64 (no headers)
    const pemKey = publicKey.includes('-----BEGIN')
      ? publicKey
      : `-----BEGIN PUBLIC KEY-----\n${publicKey}\n-----END PUBLIC KEY-----`;

    const verifier = crypto.createVerify('sha256');
    verifier.update(timestampPayload);

    return verifier.verify(
      {
        key: pemKey,
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
router.post('/sendgrid', express.raw({ type: 'application/json' }), async (req, res) => {
  const rawBody = req.body.toString('utf8');
  req.body = JSON.parse(rawBody);

  const publicKey = process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY;
  const signature = req.headers['x-twilio-email-event-webhook-signature'];
  const timestamp = req.headers['x-twilio-email-event-webhook-timestamp'];

  // Verify signature if verification key is configured
  if (publicKey) {
    if (!verifySendGridSignature(publicKey, rawBody, signature, timestamp)) {
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

  for (const event of events) {
    const { event: eventType, email, sg_message_id, reason } = event;

    // Log event based on type
    // These logs are admin-only visibility (console/server logs)
    switch (eventType) {
      case 'processed':
        console.log(`[SendGrid] Email processed - ID: ${sg_message_id}, To: ${maskEmail(email)}`);
        break;

      case 'delivered':
        console.log(`[SendGrid] Email delivered - ID: ${sg_message_id}, To: ${maskEmail(email)}`);
        try {
          await EmailMetrics.create({
            sg_message_id: sg_message_id || 'unknown',
            event_type: 'delivered',
            email_hash: email ? crypto.createHash('sha256').update(email).digest('hex') : null,
            prompt_id: event.prompt_id || null,
            occurred_at: new Date(event.timestamp * 1000 || Date.now()),
            sg_machine_open: false
          });
        } catch (e) { console.error('[Webhooks] Failed to persist delivered event:', e.message); }
        break;

      case 'bounce':
        console.error(`[SendGrid] Email bounced - ID: ${sg_message_id}, To: ${maskEmail(email)}, Reason: ${reason || 'Unknown'}`);
        try {
          await EmailMetrics.create({
            sg_message_id: sg_message_id || 'unknown',
            event_type: 'bounce',
            email_hash: email ? crypto.createHash('sha256').update(email).digest('hex') : null,
            prompt_id: event.prompt_id || null,
            occurred_at: new Date(event.timestamp * 1000 || Date.now()),
            sg_machine_open: false
          });
        } catch (e) { console.error('[Webhooks] Failed to persist bounce event:', e.message); }
        break;

      case 'dropped':
        console.error(`[SendGrid] Email dropped - ID: ${sg_message_id}, To: ${maskEmail(email)}, Reason: ${reason || 'Unknown'}`);
        break;

      case 'deferred':
        console.warn(`[SendGrid] Email deferred - ID: ${sg_message_id}, To: ${maskEmail(email)}`);
        break;

      case 'spamreport':
        console.warn(`[SendGrid] Spam report received - ID: ${sg_message_id}, To: ${maskEmail(email)}`);
        try {
          await EmailMetrics.create({
            sg_message_id: sg_message_id || 'unknown',
            event_type: 'spamreport',
            email_hash: email ? crypto.createHash('sha256').update(email).digest('hex') : null,
            prompt_id: event.prompt_id || null,
            occurred_at: new Date(event.timestamp * 1000 || Date.now()),
            sg_machine_open: false
          });
        } catch (e) { console.error('[Webhooks] Failed to persist spamreport event:', e.message); }
        break;

      case 'unsubscribe':
        console.warn(`[SendGrid] Unsubscribe request - ID: ${sg_message_id}, To: ${maskEmail(email)}`);
        // TODO: In future phases, update user preferences
        break;

      case 'open':
        // CRITICAL: Exclude machine/bot opens — Apple MPP and security gateways auto-open every email
        if (!event.sg_machine_open) {
          console.log(`[SendGrid] Email opened (human) - ID: ${sg_message_id}, To: ${maskEmail(email)}`);
          try {
            await EmailMetrics.create({
              sg_message_id: sg_message_id || 'unknown',
              event_type: 'open',
              email_hash: email ? crypto.createHash('sha256').update(email).digest('hex') : null,
              prompt_id: event.prompt_id || null,
              occurred_at: new Date(event.timestamp * 1000 || Date.now()),
              sg_machine_open: false
            });
          } catch (e) { console.error('[Webhooks] Failed to persist open event:', e.message); }
        } else {
          console.log(`[SendGrid] Machine open filtered - ID: ${sg_message_id}`);
        }
        break;

      case 'click':
        console.log(`[SendGrid] Link clicked - ID: ${sg_message_id}, To: ${maskEmail(email)}`);
        break;

      default:
        console.log(`[SendGrid] Event: ${eventType} - ID: ${sg_message_id}`);
    }
  }

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
