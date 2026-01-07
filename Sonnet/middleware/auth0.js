// middleware/auth0.js
// Auth0 JWT verification middleware
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

// Check for required environment variables
if (!process.env.AUTH0_DOMAIN) {
  console.warn('⚠️  WARNING: AUTH0_DOMAIN not set. JWT verification will fail.');
}

// Initialize JWKS client
const client = jwksClient({
  jwksUri: `https://${process.env.AUTH0_DOMAIN || 'your-tenant.us.auth0.com'}/.well-known/jwks.json`,
  cache: true,
  cacheMaxAge: 86400000, // 24 hours
  rateLimit: true,
  jwksRequestsPerMinute: 5
});

// Function to get signing key
function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      return callback(err);
    }
    const signingKey = key.publicKey || key.rsaPublicKey;
    callback(null, signingKey);
  });
}

/**
 * Auth0 JWT verification middleware
 * Verifies the JWT token from Authorization header and extracts user info
 */
const verifyAuth0Token = (req, res, next) => {
  // Get token from Authorization header
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ error: 'No authorization header provided' });
  }

  // Extract token (format: "Bearer <token>")
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Invalid authorization header format. Expected: Bearer <token>' });
  }

  const token = parts[1];

  // Verify token
  // Use AUTH0_AUDIENCE if available (recommended), otherwise fall back to AUTH0_CLIENT_ID
  const audience = process.env.AUTH0_AUDIENCE || process.env.AUTH0_CLIENT_ID;
  if (!audience) {
    return res.status(500).json({ error: 'AUTH0_AUDIENCE or AUTH0_CLIENT_ID must be set' });
  }
  
  jwt.verify(
    token,
    getKey,
    {
      audience: audience,
      issuer: `https://${process.env.AUTH0_DOMAIN}/`,
      algorithms: ['RS256']
    },
    (err, decoded) => {
      if (err) {
        // Don't log specific error details in production (could leak info)
        if (process.env.NODE_ENV === 'development') {
          console.error('JWT verification error:', err.message);
        } else {
          console.error('JWT verification failed');
        }
        return res.status(401).json({ error: 'Invalid or expired token' });
      }

      // Attach user info to request object
      req.user = {
        user_id: decoded.sub, // Auth0 user ID (sub claim)
        email: decoded.email,
        name: decoded.name,
        // Include any other claims you need
      };

      next();
    }
  );
};

/**
 * Optional middleware - verifies token but doesn't require it
 * Useful for endpoints that work with or without authentication
 */
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    // No auth header, continue without user
    req.user = null;
    return next();
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    // Invalid format, continue without user
    req.user = null;
    return next();
  }

  const token = parts[1];

    // Use AUTH0_AUDIENCE if available (recommended), otherwise fall back to AUTH0_CLIENT_ID
    const audience = process.env.AUTH0_AUDIENCE || process.env.AUTH0_CLIENT_ID;
    
    jwt.verify(
    token,
    getKey,
    {
      audience: audience,
      issuer: `https://${process.env.AUTH0_DOMAIN}/`,
      algorithms: ['RS256']
    },
    (err, decoded) => {
      if (err) {
        // Invalid token, continue without user
        req.user = null;
        return next();
      }

      req.user = {
        user_id: decoded.sub,
        email: decoded.email,
        name: decoded.name,
      };

      next();
    }
  );
};

module.exports = {
  verifyAuth0Token,
  optionalAuth
};

