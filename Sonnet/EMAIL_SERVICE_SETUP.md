# Email Service Setup (SendGrid)

This guide explains how to set up SendGrid for email notifications when game sessions are added.

## Why This Is Needed

The application sends email notifications to group members when:
- A new game session is scheduled for a future date (after today)
- Users are added to groups (future feature)
- Other email notifications (future features)

## Step 1: Create a SendGrid Account

1. Go to [SendGrid](https://sendgrid.com)
2. Sign up for a free account (allows up to 100 emails/day)
3. Verify your email address

## Step 2: Create an API Key

1. In SendGrid Dashboard, go to **Settings** → **API Keys**
2. Click **Create API Key**
3. Name it (e.g., "PeriodicTableTop Backend")
4. Choose **Full Access** (or create a Restricted Access key with "Mail Send" permission)
5. Click **Create & View**
6. **IMPORTANT:** Copy the API key immediately - you won't be able to see it again!
7. Save it securely - this is your `SENDGRID_API_KEY`

## Step 3: Verify Sender Identity (Production Only)

For production use, you need to verify your sender email:

1. Go to **Settings** → **Sender Authentication**
2. Choose one:
   - **Domain Authentication** (recommended for production)
   - **Single Sender Verification** (easier, good for testing)
3. Follow the verification steps
4. Once verified, note the verified email address - this is your `SENDGRID_FROM_EMAIL`

## Step 4: Add Environment Variables

### Local Development (.env file)

Add these to your backend `.env` file:

```env
SENDGRID_API_KEY=your-sendgrid-api-key-here
SENDGRID_FROM_EMAIL=noreply@yourdomain.com  # Optional, defaults to noreply@periodictabletop.com
FRONTEND_URL=http://localhost:3000  # Optional, used for email links
```

### Railway (Production)

1. Go to your Railway project dashboard
2. Select your backend service
3. Go to **Variables** tab
4. Add these variables:
   - `SENDGRID_API_KEY` = (your SendGrid API key from Step 2)
   - `SENDGRID_FROM_EMAIL` = (your verified sender email from Step 3)
   - `FRONTEND_URL` = (your production frontend URL, e.g., https://your-app.vercel.app)

## Step 5: Run Database Migration

The email notifications feature requires a new database field:

```bash
cd periodictabletopbackend_v2/Sonnet
npm run migrate
```

Or manually run the migration:

```bash
node scripts/run-migrations.js
```

This adds the `email_notifications_enabled` field to the `Users` table (defaults to `true`).

## Step 6: Verify Setup

After adding environment variables and running migrations:

1. **Restart your backend server** (if it's running)
2. **Check logs** - you should NOT see "SENDGRID_API_KEY not set" warnings
3. **Test email sending:**
   - Create a future game session event
   - Check that group members receive emails (if they have `email_notifications_enabled = true`)

## Testing Email Notifications

### In Development

1. Create a test user with a real email address
2. Create a group with that user
3. Create a future game session (date > today)
4. Check the console logs for email sending status
5. Check the user's email inbox

### In Production

1. Verify SendGrid Dashboard → **Activity** → **Email Activity** shows sent emails
2. Check user inboxes for notifications
3. Monitor Railway logs for any email errors

## Troubleshooting

### "Email service not configured" warnings

- **Cause:** `SENDGRID_API_KEY` not set in environment variables
- **Fix:** Add `SENDGRID_API_KEY` to your `.env` file (local) or Railway variables (production)
- **Restart:** Restart your backend server after adding the variable

### Emails not sending

1. **Check SendGrid API key:**
   - Verify the API key is correct in environment variables
   - Check that the key has "Mail Send" permission

2. **Check sender verification:**
   - For production, the sender email must be verified in SendGrid
   - For testing, you can use Single Sender Verification

3. **Check SendGrid Activity:**
   - Go to SendGrid Dashboard → **Activity** → **Email Activity**
   - Look for failed sends and error messages

4. **Check user notification preferences:**
   - Users with `email_notifications_enabled = false` won't receive emails
   - Check the `Users` table: `SELECT email, email_notifications_enabled FROM "Users";`

5. **Check email validity:**
   - Users with invalid emails (e.g., `@auth0.local`) are automatically excluded
   - Verify users have real email addresses

6. **Check Railway logs:**
   - Look for "Error sending game session notification email" messages
   - Check for SendGrid API errors

### Emails going to spam

- **Verify sender domain** (Domain Authentication in SendGrid)
- **Add SPF and DKIM records** to your domain
- **Use a professional sender email** (e.g., `noreply@yourdomain.com`)
- **Don't send too many emails at once** (Stay within SendGrid's limits)

## Email Notification Behavior

- **When sent:** Only for future events (start_date > today)
- **Recipients:** All group members with:
  - Valid email address
  - `email_notifications_enabled = true` (default)
  - Email not containing `@auth0.local` or `@auth0`
- **Timing:** Emails are sent asynchronously after event creation
- **Failure handling:** Email failures don't prevent event creation
- **Errors:** Email errors are logged but don't crash the server

## Alternative Email Services

If you prefer to use a different email service, you can modify `services/emailService.js`:

- **AWS SES:** Use `aws-sdk` package
- **Nodemailer:** Use `nodemailer` package with SMTP
- **Mailgun:** Use `mailgun-js` package
- **Resend:** Use `resend` package

The email service interface should match the current `sendGameSessionNotification()` method signature.

## Future Features

This email service will also be used for:
- Group invitation emails (when users are added to groups)
- Other notification emails (as features are added)
