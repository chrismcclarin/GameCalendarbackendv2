// utils/errorHandler.js
// Utility functions for safe error handling in production

/**
 * Get a safe error message for client responses
 * In production, don't expose internal error details
 */
function getSafeErrorMessage(error, defaultMessage = 'An error occurred') {
  if (process.env.NODE_ENV === 'development') {
    // In development, show full error details
    return error.message || defaultMessage;
  }
  
  // In production, return generic message
  // Log full error server-side for debugging
  console.error('Error details (server-side only):', {
    message: error.message,
    name: error.name,
    stack: error.stack
  });
  
  return defaultMessage;
}

/**
 * Send a safe error response
 */
function sendSafeError(res, statusCode, error, defaultMessage = 'An error occurred') {
  const message = getSafeErrorMessage(error, defaultMessage);
  res.status(statusCode).json({ error: message });
}

module.exports = {
  getSafeErrorMessage,
  sendSafeError
};


