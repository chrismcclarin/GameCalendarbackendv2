// middleware/requestLogger.js
// Request logging middleware for security auditing

const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  
  // Log request details
  const logData = {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent'),
    user_id: req.user?.user_id || 'anonymous',
  };

  // Log the request (in production, you might want to use a proper logging library)
  if (process.env.NODE_ENV !== 'test') {
    console.log(`[${logData.timestamp}] ${logData.method} ${logData.path} - IP: ${logData.ip} - User: ${logData.user_id}`);
  }

  // Log response when it finishes
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logEntry = {
      ...logData,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
    };

    // Log errors and suspicious activity
    if (res.statusCode >= 400) {
      console.warn(`[ERROR] ${logEntry.method} ${logEntry.path} - Status: ${logEntry.statusCode} - Duration: ${logEntry.duration} - User: ${logEntry.user_id}`);
    } else if (process.env.NODE_ENV === 'development') {
      console.log(`[SUCCESS] ${logEntry.method} ${logEntry.path} - Status: ${logEntry.statusCode} - Duration: ${logEntry.duration}`);
    }
  });

  next();
};

module.exports = requestLogger;


