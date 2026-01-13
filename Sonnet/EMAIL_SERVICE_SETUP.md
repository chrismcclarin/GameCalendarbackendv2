# Email Service Setup (Porkbun SMTP)

This guide explains how to set up Porkbun SMTP for email notifications when game sessions are added.

## Why This Is Needed

The application sends email notifications to group members when:
- A new game session is scheduled for a future date (after today)
- Users are added to groups (future feature)
- Other email notifications (future features)

## Email Service Configuration

The application uses **Porkbun SMTP** via nodemailer to send emails. The configuration is:

- **SMTP Host**: `smtp.porkbun.com`
- **Port**: `587`
- **Security**: TLS/STARTTLS
- **Username**: `noreply@nextgamenight.app`
- **Password**: Stored in `EMAIL_PASSWORD` environment variable

## Step 1: Get Your Email Password

1. Log in to your Porkbun account
2. Navigate to your email settings for `noreply@nextgamenight.app`
3. Get the SMTP password for this email address
4. **Save it securely** - this will be your `EMAIL_PASSWORD` environment variable

**Note**: If you don't have the SMTP password, you may need to:
- Generate a new SMTP password in Porkbun
- Or use the email account password (if SMTP authentication uses the same password)

## Step 2: Add Environment Variables

### Local Development (.env file)

Add these to your backend `.env` file:

```env
EMAIL_PASSWORD=your-porkbun-smtp-password-here
FROM_EMAIL=noreply@nextgamenight.app  # Optional, defaults to noreply@nextgamenight.app
FRONTEND_URL=http://localhost:3000  # Optional, used for email links
```

### Railway (Production)

1. Go to your Railway project dashboard
2. Select your backend service
3. Go to **Variables** tab
4. Add these variables:
   - `EMAIL_PASSWORD` = (your Porkbun SMTP password from Step 1)
   - `FROM_EMAIL` = `noreply@nextgamenight.app` (optional, defaults to this)
   - `FRONTEND_URL` = (your production frontend URL, e.g., https://your-app.vercel.app)

## Step 3: Run Database Migration

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

## Step 4: Verify Setup

After adding environment variables and running migrations:

1. **Restart your backend server** (if it's running)
2. **Check logs** - you should NOT see "EMAIL_PASSWORD not set" warnings
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

1. Check user inboxes for notifications
2. Monitor Railway logs for any email errors
3. Verify emails are being sent successfully

## Troubleshooting

### "Email service not configured" warnings

- **Cause:** `EMAIL_PASSWORD` not set in environment variables
- **Fix:** Add `EMAIL_PASSWORD` to your `.env` file (local) or Railway variables (production)
- **Restart:** Restart your backend server after adding the variable

### Emails not sending

1. **Check EMAIL_PASSWORD:**
   - Verify the password is correct in environment variables
   - Make sure it's the SMTP password, not the web login password
   - Check that the password doesn't have extra spaces or quotes

2. **Check SMTP connection:**
   - Verify `smtp.porkbun.com` is accessible
   - Check that port 587 is not blocked by firewall
   - Verify TLS/STARTTLS is working

3. **Check user notification preferences:**
   - Users with `email_notifications_enabled = false` won't receive emails
   - Check the `Users` table: `SELECT email, email_notifications_enabled FROM "Users";`

4. **Check email validity:**
   - Users with invalid emails (e.g., `@auth0.local`) are automatically excluded
   - Verify users have real email addresses

5. **Check Railway logs:**
   - Look for "Error sending game session notification email" messages
   - Check for SMTP authentication errors
   - Look for connection timeout errors

### Common SMTP Errors

**"Invalid login" or "Authentication failed":**
- Verify `EMAIL_PASSWORD` is correct
- Make sure you're using the SMTP password, not the web login password
- Check that the username is `noreply@nextgamenight.app`

**"Connection timeout" or "ECONNREFUSED":**
- Verify `smtp.porkbun.com` is accessible
- Check that port 587 is not blocked
- Try testing the connection from your local machine

**"TLS/SSL errors":**
- The service is configured to use STARTTLS on port 587
- If you see TLS errors, verify Porkbun's SMTP settings haven't changed

### Emails going to spam

- **Verify sender email** is properly configured in Porkbun
- **Use a professional sender email** (`noreply@nextgamenight.app`)
- **Don't send too many emails at once** (Stay within Porkbun's limits)
- **Include proper email headers** (already handled by nodemailer)

## Email Notification Behavior

- **When sent:** Only for future events (start_date > today)
- **Recipients:** All group members with:
  - Valid email address
  - `email_notifications_enabled = true` (default)
  - Email not containing `@auth0.local` or `@auth0`
- **Timing:** Emails are sent asynchronously after event creation
- **Failure handling:** Email failures don't prevent event creation
- **Errors:** Email errors are logged but don't crash the server

## SMTP Configuration Details

The email service uses the following SMTP settings:

```javascript
{
  host: 'smtp.porkbun.com',
  port: 587,
  secure: false,  // Use STARTTLS (not SSL)
  auth: {
    user: 'noreply@nextgamenight.app',
    pass: process.env.EMAIL_PASSWORD
  }
}
```

These settings are configured in `services/emailService.js` and use nodemailer for sending.

## Future Features

This email service will also be used for:
- Group invitation emails (when users are added to groups)
- Other notification emails (as features are added)
