/**
 * Rate Limiter Middleware
 * Standalone rate limiting using express-rate-limit (in-memory store)
 * No Redis dependency — suitable for single-instance deployment
 */

const rateLimit = require('express-rate-limit');
const config = require('../config/config');
const logger = require('../utils/logger');

/**
 * Rate limiter for patient-facing endpoints
 */
const patientChatLimiter = rateLimit({
  windowMs: config.patientRateLimit.windowMs,
  max: config.patientRateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'RATE_LIMITED',
    message: 'Too many requests. Please slow down.',
  },
  handler: (req, res, next, options) => {
    logger.warn('Patient rate limit exceeded', {
      ip: req.ip,
      path: req.path,
    });
    res.status(429).json(options.message);
  },
});

/**
 * Rate limiter for staff-facing endpoints
 */
const staffChatLimiter = rateLimit({
  windowMs: config.staffRateLimit.windowMs,
  max: config.staffRateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'RATE_LIMITED',
    message: 'Too many requests. Please slow down.',
  },
  handler: (req, res, next, options) => {
    logger.warn('Staff rate limit exceeded', {
      ip: req.ip,
      path: req.path,
    });
    res.status(429).json(options.message);
  },
});

module.exports = { patientChatLimiter, staffChatLimiter };
