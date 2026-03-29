// routes/webhooks.js
// Webhook handlers for external service callbacks (SendGrid delivery events, Twilio inbound SMS)
const express = require('express');
const crypto = require('crypto');
const twilio = require('twilio');
const { Op } = require('sequelize');
const router = express.Router();
const { EmailMetrics, User, Event, EventRsvp, SentNotification, Game } = require('../models');
const { parseReply } = require('../services/smsReplyParser');
const { smsInboundLimiter } = require('../middleware/rateLimiter');

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
router.post('/sendgrid', async (req, res) => {
  // req.body is already parsed by global express.json(); raw bytes are in req.rawBody (set via verify callback)
  const rawBody = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body);

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
            sg_machine_open: false,
            source_type: 'sendgrid_live'
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
            sg_machine_open: false,
            source_type: 'sendgrid_live'
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
            sg_machine_open: false,
            source_type: 'sendgrid_live'
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
              sg_machine_open: false,
              source_type: 'sendgrid_live'
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

// ============================================================
// Twilio Inbound SMS Webhook
// ============================================================

/**
 * Twilio signature validation middleware.
 * In production, validates X-Twilio-Signature using TWILIO_AUTH_TOKEN.
 * In non-production, validation is skipped automatically.
 * twilio.webhook() handles URL reconstruction and protocol detection internally,
 * avoiding proxy pitfalls (RESEARCH.md Pitfall 2).
 */
const twilioWebhookValidation = twilio.webhook({ validate: process.env.NODE_ENV === 'production' });

/**
 * Handle inbound SMS replies from Twilio.
 * Users RSVP to events by replying to SMS notifications they received.
 *
 * Flow:
 * 1. Look up user by phone number
 * 2. Parse reply text (RSVP yes/no/maybe, opt-out, or unknown)
 * 3. Resolve target event via most recent SentNotification
 * 4. Upsert EventRsvp record
 * 5. Return TwiML auto-reply with confirmation
 *
 * POST /api/webhooks/twilio/sms
 */
router.post('/twilio/sms', smsInboundLimiter, twilioWebhookValidation, async (req, res) => {
  try {
    const { From, Body } = req.body;

    // 1. Look up user by phone number
    const user = await User.findOne({ where: { phone: From } });
    if (!user) {
      // Unknown phone number -- silent ignore (no response)
      return res.type('text/xml').send('<Response/>');
    }

    // 2. Parse the reply text
    const parsed = parseReply(Body);

    // 3. Handle by parsed type
    const twiml = new twilio.twiml.MessagingResponse();

    // Opt-out: disable SMS and confirm
    if (parsed.type === 'opt_out') {
      user.sms_enabled = false;
      await user.save();
      twiml.message("You've been unsubscribed from SMS notifications. You can re-enable SMS in your profile.");
      return res.type('text/xml').send(twiml.toString());
    }

    // Unknown text: send help message
    if (parsed.type === 'unknown') {
      twiml.message('Reply 1=Yes, 2=No, 3=Maybe to RSVP. Reply STOP to opt out.');
      return res.type('text/xml').send(twiml.toString());
    }

    // RSVP: resolve event via most recent SentNotification
    const notification = await SentNotification.findOne({
      where: { phone: From, channel: 'sms' },
      include: [{
        model: Event,
        where: { status: { [Op.ne]: 'cancelled' } },
        include: [{ model: Game, attributes: ['name'] }],
        required: true,
      }],
      order: [['sent_at', 'DESC']],
    });

    if (!notification) {
      twiml.message('No upcoming events to RSVP for right now.');
      return res.type('text/xml').send(twiml.toString());
    }

    // Check for stale event (already passed)
    const eventDate = new Date(notification.Event.start_date);
    if (eventDate < new Date()) {
      const frontendUrl = process.env.FRONTEND_URL || 'https://nextgamenight.app';
      twiml.message(`That event has already passed. Check the app for upcoming events: ${frontendUrl}`);
      return res.type('text/xml').send(twiml.toString());
    }

    // 4. RSVP upsert (matching existing pattern from routes/rsvp.js)
    const existing = await EventRsvp.findOne({
      where: { event_id: notification.Event.id, user_id: user.user_id },
    });

    if (existing) {
      await existing.update({ status: parsed.status });
    } else {
      await EventRsvp.create({
        event_id: notification.Event.id,
        user_id: user.user_id,
        status: parsed.status,
      });
    }

    // 5. Build confirmation TwiML
    const statusLabel = parsed.status.charAt(0).toUpperCase() + parsed.status.slice(1);
    const eventName = notification.Event.Game ? notification.Event.Game.name : 'Game Night';
    const dateStr = eventDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const eventUrl = `${process.env.FRONTEND_URL || 'https://nextgamenight.app'}/groupHomePage/${notification.Event.group_id}`;

    twiml.message(`RSVP recorded: ${statusLabel} for ${eventName} (${dateStr}). ${eventUrl}`);
    return res.type('text/xml').send(twiml.toString());

  } catch (error) {
    console.error('[Webhooks] Twilio inbound SMS error:', error);
    // Never expose errors to SMS sender -- return empty TwiML
    return res.type('text/xml').send('<Response/>');
  }
});

module.exports = router;
