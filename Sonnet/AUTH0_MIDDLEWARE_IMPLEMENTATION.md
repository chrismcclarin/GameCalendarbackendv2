# Auth0 JWT Verification Middleware - Implementation Summary

## ✅ What Was Implemented

### 1. **Auth0 JWT Verification Middleware** (`middleware/auth0.js`)
- Verifies JWT tokens from Auth0
- Uses JWKS (JSON Web Key Set) for secure token verification
- Extracts user information (user_id, email, name) from verified tokens
- Attaches user info to `req.user` for use in routes

### 2. **Frontend Token Integration** (`src/lib/api.js`)
- Updated `apiFetch` to automatically retrieve and send Auth0 access tokens
- Creates `/api/auth/token` endpoint to get tokens from Auth0 session
- Automatically adds `Authorization: Bearer <token>` header to all API requests

### 3. **Backend Route Protection** (`server.js`)
- Applied `verifyAuth0Token` middleware to all protected routes
- Public routes: `/api/games` (game search)
- Optional auth: `/api/feedback` (can work with or without auth)
- Protected routes: All other endpoints require valid Auth0 token

### 4. **Route Updates** - All routes now:
- Use `req.user.user_id` from verified token instead of trusting client input
- Verify that authenticated user matches requested resource
- Return 401 (Unauthorized) if no token provided
- Return 403 (Forbidden) if user tries to access another user's data

**Updated Routes:**
- ✅ `routes/groups.js` - All endpoints updated
- ✅ `routes/events.js` - All endpoints updated
- ✅ `routes/userGames.js` - All endpoints updated
- ✅ `routes/googleAuth.js` - All endpoints updated
- ✅ `routes/lists.js` - Updated
- ✅ `routes/gameReviews.js` - Updated

## 🔧 Required Environment Variables

Add these to your backend `.env` file:

```env
# Auth0 Configuration - REQUIRED
AUTH0_DOMAIN=your-tenant.us.auth0.com

# Choose ONE of the following:
# Option 1 (RECOMMENDED): If you created an Auth0 API
AUTH0_AUDIENCE=your-api-identifier

# Option 2: If you don't have a separate API, use your application's Client ID
# AUTH0_CLIENT_ID=your-client-id
```

**Important:**
- `AUTH0_DOMAIN` is **REQUIRED** - Always include this
- Use `AUTH0_AUDIENCE` if you created an Auth0 API (recommended)
- Use `AUTH0_CLIENT_ID` only if you don't have a separate API (fallback)
- **Do NOT set both** - The middleware uses `AUTH0_AUDIENCE` if available, otherwise `AUTH0_CLIENT_ID`

## 📋 Next Steps

### 1. **Set Up Auth0 API** (Required)

1. Go to https://manage.auth0.com
2. Navigate to **Applications → APIs**
3. **Create a new API**:
   - **Name**: "Periodic Tabletop API" (or your choice)
   - **Identifier**: This is your `AUTH0_AUDIENCE` (e.g., `https://api.periodictabletop.com`)
   - **Signing Algorithm**: RS256 (default)
   - Click "Create"

4. **Get your Auth0 Domain**:
   - Go to **Applications → Settings**
   - Your domain is shown at the top (e.g., `your-tenant.us.auth0.com`)

5. **Update your Next.js Application**:
   - Go to **Applications → Applications**
   - Select your Next.js application
   - Go to **Settings → Advanced Settings → Grant Types**
   - Ensure **Authorization Code** is enabled
   - Scroll to **APIs** section
   - Authorize your API (the one you just created)

### 2. **Update Frontend Environment Variables**

Add to your frontend `.env.local`:

```env
AUTH0_SECRET=your-auth0-secret
AUTH0_BASE_URL=http://localhost:3000
AUTH0_ISSUER_BASE_URL=https://your-tenant.us.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret
AUTH0_AUDIENCE=your-api-identifier  # Same as backend AUTH0_AUDIENCE
```

### 3. **Test the Implementation**

1. **Start both servers**
2. **Log in** to the frontend
3. **Check browser DevTools → Network tab**:
   - All API requests should include `Authorization: Bearer <token>` header
4. **Test an endpoint** - Should work with authentication
5. **Test without auth** - Should return 401 Unauthorized

## 🔒 Security Improvements

✅ **User IDs are now verified** - Cannot impersonate other users
✅ **All endpoints are protected** - Requires valid Auth0 token
✅ **Token verification** - Uses Auth0's JWKS for secure verification
✅ **Automatic token refresh** - Frontend handles token refresh automatically
✅ **No client-trusted user IDs** - All user IDs come from verified tokens

## ⚠️ Important Notes

1. **The middleware will fail if `AUTH0_DOMAIN` is not set** - Make sure to add it to your `.env` file
2. **You need to create an Auth0 API** - The frontend needs an API identifier to get access tokens
3. **All existing API calls will fail** until you:
   - Set up the Auth0 API
   - Add environment variables
   - Restart both servers

## 🐛 Troubleshooting

### Error: "No authorization header provided"
- Check that frontend is sending tokens
- Verify `/api/auth/token` endpoint is working
- Check browser DevTools → Network tab for Authorization header

### Error: "Invalid or expired token"
- Check `AUTH0_DOMAIN` is correct
- Check `AUTH0_AUDIENCE` matches your API identifier
- Verify token hasn't expired

### Error: "JWT verification error"
- Ensure Auth0 API is configured correctly
- Check JWKS endpoint: `https://YOUR_DOMAIN/.well-known/jwks.json`
- Verify signing algorithm is RS256

