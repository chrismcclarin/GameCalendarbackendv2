# Setting Up Auth0 User IDs for Seed Data

The seed data needs real Auth0 `sub` (subject) values to match users in your database. Here's how to get them:

## Quick Method: Browser Console

1. **Start your frontend server:**
   ```bash
   cd periodictabletop
   npm run dev
   ```

2. **Log in to your app** at http://localhost:3000

3. **Open browser DevTools** (F12 or Cmd+Option+I on Mac)

4. **Check the Console tab** - you should see:
   ```
   🔑 Your Auth0 sub value: auth0|1234567890abcdef
   📧 Your email: your-email@example.com
   👤 Your name: Your Name
   ```

5. **Copy the `sub` value** and update `seed-sample-data.js`

## Alternative: Auth0 Dashboard

1. Go to https://manage.auth0.com
2. Navigate to **User Management > Users**
3. Click on a user
4. Copy the **User ID** field (this is the `sub` value)
   - Format: `auth0|1234567890abcdef` or `google-oauth2|...`

## Updating Seed Data

### Option 1: Direct Edit
Edit `scripts/seed-sample-data.js` and replace the `user_id` values:

```javascript
const sampleUsers = [
  { user_id: 'auth0|YOUR_ACTUAL_SUB_HERE', username: 'Alice', email: 'alice@example.com' },
  { user_id: 'auth0|ANOTHER_SUB_HERE', username: 'Bob', email: 'bob@example.com' },
  // ... etc
];
```

### Option 2: Environment Variables
Set environment variables before running the seed script:

```bash
export AUTH0_ALICE_SUB="auth0|your-alice-sub"
export AUTH0_BOB_SUB="auth0|your-bob-sub"
export AUTH0_CHARLIE_SUB="auth0|your-charlie-sub"
# ... etc

npm run seed
```

Or create a `.env` file in the `Sonnet` directory:
```
AUTH0_ALICE_SUB=auth0|your-alice-sub
AUTH0_BOB_SUB=auth0|your-bob-sub
AUTH0_CHARLIE_SUB=auth0|your-charlie-sub
AUTH0_DIANA_SUB=auth0|your-diana-sub
AUTH0_EVE_SUB=auth0|your-eve-sub
AUTH0_FRANK_SUB=auth0|your-frank-sub
```

## Important Notes

- The `user_id` in the database **must match** the Auth0 `sub` claim
- If you log in with a different Auth0 account, the backend will create a new user automatically
- The seed data is just for testing - real users are created when they first log in
- You can remove the console.log statements from `page.js` after getting your sub values

## Testing

After updating the seed data:

1. Run the seed script:
   ```bash
   cd periodictabletopbackend_v2/Sonnet
   npm run seed
   ```

2. Log in to your app with an Auth0 account that matches one of the seeded users

3. You should see the groups and data associated with that user





