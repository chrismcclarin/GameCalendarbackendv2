// middleware/rateLimiter.js
// Rate limiting middleware to prevent abuse and DDoS attacks
const rateLimit = require('express-rate-limit');

// Adjust rate limits based on environment
const isDevelopment = process.env.NODE_ENV !== 'production';
const API_LIMIT = isDevelopment ? 1000 : 100; // Much higher limit for development
const WRITE_LIMIT = isDevelopment ? 500 : 50;
const AUTH_LIMIT = isDevelopment ? 50 : 5;
const FEEDBACK_LIMIT = isDevelopment ? 20 : 5;

// General API rate limiter - Higher limit in development
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: API_LIMIT, // Limit each IP to API_LIMIT requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  // Skip rate limiting for localhost in development
  skip: (req) => isDevelopment && (req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1'),
});

// Stricter rate limiter for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: AUTH_LIMIT, // Limit each IP to AUTH_LIMIT requests per windowMs
  message: {
    error: 'Too many authentication attempts, please try again later.',
  },
  skipSuccessfulRequests: true, // Don't count successful requests
  skip: (req) => isDevelopment && (req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1'),
});

// Stricter rate limiter for feedback endpoint (prevent spam)
const feedbackLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: FEEDBACK_LIMIT, // Limit each IP to FEEDBACK_LIMIT feedback submissions per hour
  message: {
    error: 'Too many feedback submissions, please try again later.',
  },
  skip: (req) => isDevelopment && (req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1'),
});

// Very strict rate limiter for sensitive operations (create/update/delete)
const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: WRITE_LIMIT, // Limit each IP to WRITE_LIMIT write operations per 15 minutes
  message: {
    error: 'Too many write operations, please try again later.',
  },
  skip: (req) => isDevelopment && (req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1'),
});

// Middleware that only applies strict limiter to write operations (POST, PUT, DELETE)
// GET requests will use the general apiLimiter instead
const writeOperationLimiter = (req, res, next) => {
  // Only apply strict limiter to write operations
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return strictLimiter(req, res, next);
  }
  // For GET requests, skip this limiter (apiLimiter will handle it)
  next();
};

module.exports = {
  apiLimiter,
  authLimiter,
  feedbackLimiter,
  strictLimiter,
  writeOperationLimiter,
};

