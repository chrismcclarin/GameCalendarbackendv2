// scripts/get-auth0-sub.js
// Helper script to get Auth0 user sub values
// Run this in your browser console after logging in, or use the instructions below

console.log(`
===========================================
How to Get Your Auth0 'sub' Value
===========================================

METHOD 1: Browser Console (Easiest)
------------------------------------
1. Log in to your app at http://localhost:3000
2. Open browser DevTools (F12 or Cmd+Option+I)
3. Go to the Console tab
4. Type: user
5. Press Enter
6. Look for the 'sub' property - that's your Auth0 user ID

Or add this to your page.js temporarily:
  console.log('Auth0 sub:', user?.sub);

METHOD 2: Auth0 Dashboard
------------------------------------
1. Go to https://manage.auth0.com
2. Navigate to User Management > Users
3. Click on a user
4. The "User ID" field is the 'sub' value
   (It looks like: auth0|1234567890abcdef)

METHOD 3: Network Tab
------------------------------------
1. Log in to your app
2. Open DevTools > Network tab
3. Look for API calls to /api/groups/user/
4. The URL will contain your encoded 'sub' value

===========================================
Once you have your sub values, update:
scripts/seed-sample-data.js

Replace the user_id values in sampleUsers array:
  { user_id: 'YOUR_AUTH0_SUB_HERE', username: 'Alice', email: 'alice@example.com' },
===========================================
`);





