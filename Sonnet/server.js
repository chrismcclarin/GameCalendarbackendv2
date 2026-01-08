// server.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { sequelize } = require('./models');

// Initialize Sentry error tracking (if DSN is provided)
let Sentry = null;
if (process.env.SENTRY_DSN) {
  try {
    Sentry = require('@sentry/node');
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0, // 10% in prod, 100% in dev
    });
    console.log('Sentry error tracking initialized.');
  } catch (error) {
    console.warn('Sentry initialization failed:', error.message);
  }
}

// Import middleware
const { verifyAuth0Token, optionalAuth } = require('./middleware/auth0');
const { apiLimiter, authLimiter, feedbackLimiter, writeOperationLimiter } = require('./middleware/rateLimiter');
const requestLogger = require('./middleware/requestLogger');

// Import routes
const userRoutes = require('./routes/users');
const groupRoutes = require('./routes/groups');
const eventRoutes = require('./routes/events');
const gameRoutes = require('./routes/games');
const listRoutes = require('./routes/lists');
const gameReviewRoutes = require('./routes/gameReviews');
const userGameRoutes = require('./routes/userGames');
const feedbackRoutes = require('./routes/feedback');
const googleAuthRoutes = require('./routes/googleAuth');
const availabilityRoutes = require('./routes/availability');

const app = express();
const PORT = process.env.PORT || 4000;

// Trust proxy - required for Railway and other platforms that use reverse proxies
// Set to 1 to trust only the first proxy (Railway's reverse proxy)
// This is more secure than 'true' which trusts all proxies
app.set('trust proxy', 1);

// HTTPS Enforcement (for production)
// Note: Heroku handles HTTPS at the load balancer, but this adds extra protection
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    // Check if request is secure (Heroku sets x-forwarded-proto)
    const isSecure = req.secure || 
                     req.headers['x-forwarded-proto'] === 'https' ||
                     req.headers['x-forwarded-ssl'] === 'on';
    
    if (!isSecure && req.method === 'GET') {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

// Sentry request handler (must be before other middleware)
if (Sentry) {
  app.use(Sentry.Handlers.requestHandler());
}

// Security Middleware
// 1. Helmet - Set security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow embedding if needed
}));

// 2. CORS configuration - allow frontend domains
// Support both localhost (development) and production domains
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001', // Alternative local port
  process.env.FRONTEND_URL, // Production frontend URL from env
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null, // Vercel preview deployments
].filter(Boolean); // Remove null/undefined values

// Add any additional origins from environment variable (comma-separated)
if (process.env.ALLOWED_ORIGINS) {
  allowedOrigins.push(...process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim()));
}

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman, etc.) in development
    if (!origin && process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    
    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // In production, be strict about origins
      if (process.env.NODE_ENV === 'production') {
        console.warn(`CORS: Blocked request from origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      } else {
        // In development, allow any origin
        callback(null, true);
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
}));

// 3. Request body parsing with size limit
app.use(express.json({ limit: '10mb' })); // Limit request body size

// 4. Request logging for security auditing
app.use(requestLogger);

// 5. Rate limiting - Apply general API rate limiter to all routes
app.use('/api/', apiLimiter);

// Routes
// Public routes (no auth required)
app.use('/api/games', gameRoutes); // Game search is public
app.use('/api/feedback', feedbackLimiter, optionalAuth, feedbackRoutes); // Feedback with strict rate limiting

// Protected routes (require Auth0 token)
// Apply write operation rate limiting only to POST/PUT/DELETE requests
// GET requests will use the general apiLimiter
app.use('/api/users', verifyAuth0Token, userRoutes);
app.use('/api/groups', writeOperationLimiter, verifyAuth0Token, groupRoutes);
app.use('/api/events', writeOperationLimiter, verifyAuth0Token, eventRoutes);
app.use('/api/lists', verifyAuth0Token, listRoutes);
app.use('/api/game-reviews', writeOperationLimiter, verifyAuth0Token, gameReviewRoutes);
app.use('/api/user-games', writeOperationLimiter, verifyAuth0Token, userGameRoutes);
app.use('/api/auth', authLimiter, verifyAuth0Token, googleAuthRoutes);
app.use('/api/availability', writeOperationLimiter, verifyAuth0Token, availabilityRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Sentry error handler (must be after all routes, before error handler)
if (Sentry) {
  app.use(Sentry.Handlers.errorHandler());
}

// Global error handler (catch-all for unhandled errors)
app.use((err, req, res, next) => {
  // Log error to Sentry if available
  if (Sentry) {
    Sentry.captureException(err);
  }
  
  // Don't expose error details in production
  const message = process.env.NODE_ENV === 'production' 
    ? 'An internal error occurred' 
    : err.message;
  
  res.status(err.status || 500).json({ error: message });
});

// Initialize database and start server
const startServer = async () => {
  try {
    console.log('Attempting to connect to database...');
    console.log('DATABASE_URL present:', !!process.env.DATABASE_URL);
    console.log('POSTGRES_URL present:', !!process.env.POSTGRES_URL);
    console.log('NODE_ENV:', process.env.NODE_ENV);
    
    // Add retry logic for database connection with different SSL configurations
    let retries = 5;
    let connected = false;
    let lastError = null;
    
    while (retries > 0 && !connected) {
      try {
        await sequelize.authenticate();
        connected = true;
        console.log('Database connection established successfully.');
      } catch (error) {
        lastError = error;
        retries--;
        
        // Log detailed error information
        console.error(`Database connection attempt failed (${6 - retries}/5):`);
        console.error(`  Error code: ${error.code || 'N/A'}`);
        console.error(`  Error message: ${error.message}`);
        if (error.parent) {
          console.error(`  Parent error: ${error.parent.message || error.parent.code || 'N/A'}`);
        }
        
        if (retries > 0) {
          const waitTime = 3000; // Wait 3 seconds before retry
          console.log(`Retrying in ${waitTime/1000} seconds... (${retries} attempts remaining)`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }
    
    if (!connected) {
      console.error('All database connection attempts failed.');
      console.error('Last error details:', {
        code: lastError?.code,
        message: lastError?.message,
        parent: lastError?.parent?.message,
      });
      throw lastError;
    }
    
    // Database sync strategy:
    // - Development: Use sync to auto-create tables (convenient for dev)
    // - Production: Use migrations only (sync disabled for safety)
    // - Test: Use sync for test database
    if (process.env.NODE_ENV === 'production') {
      // In production, DO NOT use sync - use migrations instead
      // Tables should already exist from migrations
      console.log('Production mode: Skipping database sync. Ensure migrations are run.');
    } else if (process.env.NODE_ENV === 'test') {
      // In test, use sync to reset database
      await sequelize.sync({ force: false });
      console.log('Test database synchronized.');
    } else {
      // Development: Use sync for convenience (but without alter to avoid data loss)
      await sequelize.sync({ alter: false });
      console.log('Development database synchronized (tables created if needed).');
    }
    
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('Unable to start server:', error);
    process.exit(1);
  }
};

startServer();