# Future Features - To-Do List

## Email Notifications

### 1. Email Users When Game Session is Added
**Description:** Send email notifications to all group members when a new game session is scheduled for a future date (after today).

**Requirements:**
- Email trigger: When a game session (event) is created with `start_date > today`
- Recipients: All members of the group
- Email should include:
  - Event details (game name, date, time, location if applicable)
  - Group name
  - Link to view/respond to the event
- Respect user notification preferences (opt-out toggle)
- Backend: Email service integration (e.g., SendGrid, AWS SES, Nodemailer)
- Backend endpoint: Hook into event creation route (`POST /api/events`)

**Technical Considerations:**
- Add email service configuration to environment variables
- Create email template for game session notifications
- Add queue/background job processing for emails (optional, for scalability)
- Handle email delivery failures gracefully

---

### 2. Email Notification When Added to Group
**Description:** Send email to user when they are invited/added to a group.

**Requirements:**
- Email trigger: When a user is added to a group (via `POST /api/groups/:id/members` or similar)
- Recipient: The user being added
- Email should include:
  - Group name and description
  - Who added them (if applicable)
  - Link to approve/decline group membership
  - Link to view group details
- Respect user notification preferences
- Backend: Same email service as above

**Technical Considerations:**
- Modify group member addition endpoint to send email
- Create email template for group invitations

---

## Group Membership Approval System

### 3. Approval System for Adding Members to Group
**Description:** Implement a two-step process where users must approve being added to a group before they become active members.

**Requirements:**
- When a user is added to a group, mark them as "pending" status
- Add `status` field to `UserGroup` model: `'pending' | 'active' | 'declined'`
- Create endpoint for user to approve/decline: `POST /api/groups/:id/membership/approve` or `POST /api/groups/:id/membership/decline`
- Update group member listing to show pending members separately (for admins/owners)
- Only "active" members should:
  - Receive group notifications
  - Be included in availability calculations
  - See group events
  - Participate in group activities

**Database Changes:**
- Migration: Add `status` column to `UserGroups` table
- Default status: `'pending'` for new additions, `'active'` for existing members

**Backend Routes:**
- `GET /api/groups/:id/pending-members` - Get pending members (admin/owner only)
- `POST /api/groups/:id/membership/approve` - Approve group membership
- `POST /api/groups/:id/membership/decline` - Decline group membership

**Frontend:**
- Profile page: Add section showing pending group invitations
- Approve/Decline buttons for pending invitations
- Group settings: Show pending members list for admins/owners

---

## User Notification Preferences

### 4. Notification Preferences Toggle
**Description:** Allow users to opt out of email notifications via a toggle in their profile.

**Requirements:**
- Add `email_notifications_enabled` field to `Users` table (default: `true`)
- Profile page: Add notification preferences section with toggle
- Backend endpoint: `PUT /api/users/:user_id/notifications` to update preferences
- Check notification preference before sending any emails:
  - Game session notifications
  - Group invitation emails
  - Any future email notifications

**Database Changes:**
- Migration: Add `email_notifications_enabled BOOLEAN DEFAULT true` to `Users` table

**Backend:**
- Update email sending logic to check user preference
- Create endpoint to update notification preferences
- Validation: Ensure user can only update their own preferences

**Frontend:**
- Profile page: Add "Notification Preferences" section
- Toggle for "Email Notifications" with clear description
- Save preference to backend on toggle change

---

## Friends List Feature

### 5. Friends List with Google Import
**Description:** Implement a friends list feature, potentially importing contacts from Google.

**Requirements:**
- Database: Create `Friendships` table (many-to-many relationship)
  - Columns: `id`, `user_id`, `friend_id`, `status` ('pending' | 'accepted' | 'blocked'), `created_at`, `updated_at`
  - Unique constraint: (user_id, friend_id)
  - Both directions: If A is friends with B, B is also friends with A (or handle bidirectionally)
- Backend routes:
  - `GET /api/friends` - Get user's friends list
  - `POST /api/friends/request` - Send friend request
  - `POST /api/friends/:friend_id/accept` - Accept friend request
  - `POST /api/friends/:friend_id/decline` - Decline friend request
  - `DELETE /api/friends/:friend_id` - Remove friend
  - `GET /api/friends/pending` - Get pending friend requests
- Google Contacts import:
  - Use Google People API (requires additional OAuth scope)
  - Endpoint: `POST /api/friends/import-google`
  - Parse Google contacts and show list of potential friends (users who have accounts)
  - Allow user to select which contacts to send friend requests to
- Frontend:
  - Profile page: Add "Friends" section
  - Show friends list
  - Show pending friend requests
  - Button to import from Google Contacts
  - Search for users to add as friends

**Google OAuth Scopes Needed:**
- `https://www.googleapis.com/auth/contacts.readonly` - Read Google Contacts

**Database Schema:**
```sql
CREATE TABLE "Friendships" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES "Users"(id) ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES "Users"(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'accepted', 'blocked'
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, friend_id),
  CHECK (user_id != friend_id) -- Prevent self-friending
);

CREATE INDEX idx_friendships_user_id ON "Friendships"(user_id);
CREATE INDEX idx_friendships_friend_id ON "Friendships"(friend_id);
CREATE INDEX idx_friendships_status ON "Friendships"(status);
```

**Technical Considerations:**
- Handle bidirectional friendships (if A friends B, B is automatically friends with A)
- Or use unidirectional with separate rows for each direction
- Consider privacy: Should friends list be visible to others?
- Rate limiting on friend requests
- Prevent duplicate friend requests
- Handle case where user tries to friend someone who already sent them a request

---

## Implementation Priority Suggestions

1. **Notification Preferences Toggle** - Foundation for all email features
2. **Email Notification Infrastructure** - Set up email service (SendGrid/SES/etc.)
3. **Group Membership Approval** - Important feature for user control
4. **Email Notifications** - Game session and group invitation emails
5. **Email/Password Authentication** - Alternative to Google-only sign-on, expands user base
6. **Friends List** - Most complex feature, can be built incrementally

---

---

## Authentication & Email Verification

### 6. Email/Password Authentication with Email Verification
**Description:** Add email/password authentication as an alternative to Google sign-on, with email verification to ensure email addresses are real.

**Requirements:**
- Auth0 Configuration:
  - Enable "Email" database connection in Auth0
  - Configure email verification settings
  - Set up email templates for verification
  - Configure password policy (strength requirements)
- Frontend:
  - Add "Sign up with Email" option on login/landing page
  - Create sign-up form with:
    - Email address
    - Password (with strength indicator)
    - Password confirmation
    - Username (optional, can default to email prefix)
  - Create login form for email/password users
  - Show verification status/prompt if email not verified
  - Resend verification email functionality
- Backend:
  - Auth0 handles authentication, but may need to:
    - Check email verification status via Auth0 Management API
    - Handle unverified user access (restrict certain features?)
  - Consider: Should unverified users have limited access?

**Email Verification Flow:**
1. User signs up with email/password
2. Auth0 sends verification email automatically
3. User clicks verification link in email
4. Email is marked as verified in Auth0
5. User can now fully use the application

**Auth0 Setup:**
- Enable "Email" database connection
- Configure email provider (Auth0's default or custom SMTP)
- Set email verification settings:
  - Require email verification before login (optional)
  - Or allow login but restrict features until verified
- Customize email templates for verification emails
- Configure password policy:
  - Minimum length
  - Complexity requirements
  - Password history (prevent reuse)

**Frontend Components:**
- `SignUpForm` component:
  - Email input with validation
  - Password input with strength meter
  - Password confirmation
  - Username input (optional)
  - Terms of service checkbox (if needed)
  - Submit button
- `LoginForm` component:
  - Email input
  - Password input
  - "Forgot password?" link
  - "Sign in with Google" button (existing)
- `EmailVerificationPrompt` component:
  - Show if user is logged in but email not verified
  - "Resend verification email" button
  - Instructions on how to verify

**Backend Considerations:**
- Auth0 Management API integration to check verification status
- Optional: Restrict certain features for unverified users
- Handle password reset flow (Auth0 provides this)
- Consider rate limiting on sign-up attempts

**Testing Requirements:**
- Test sign-up flow
- Test email verification link
- Test login with verified email
- Test login with unverified email (if allowed)
- Test password reset flow
- Test password strength validation
- Test duplicate email sign-up prevention
- Test invalid verification token handling
- Test resend verification email functionality

**Migration Considerations:**
- Existing Google OAuth users should continue to work
- Users should be able to link email/password to existing Google account (or vice versa)
- Consider: Should users be able to have both authentication methods?

---

## Notes

- All features should respect user notification preferences
- Email service needs to be configured in environment variables
- Consider using a job queue (Bull, BullMQ, or similar) for email sending if volume gets high
- Google Contacts import requires additional OAuth scope and consent from user
- Friends list can start simple and add Google import later
- Email/password authentication requires Auth0 Email database connection configuration
- Email verification can use Auth0's built-in system or custom implementation
