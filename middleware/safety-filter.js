/**
 * Safety Filter Middleware
 * Pre-process and validate incoming messages for safety
 */

const safetyRules = require('../config/safety-rules');
const logger = require('../utils/logger');

/**
 * Validate message content
 */
function validateMessage(req, res, next) {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({
      error: 'BAD_REQUEST',
    });
  }

  if (typeof message !== 'string') {
    return res.status(400).json({
      error: 'BAD_REQUEST',
    });
  }

  const trimmedMessage = message.trim();
  
  if (trimmedMessage.length < safetyRules.contentFilter.minMessageLength) {
    return res.status(400).json({
      error: 'BAD_REQUEST',
    });
  }

  if (trimmedMessage.length > safetyRules.contentFilter.maxMessageLength) {
    return res.status(400).json({
      error: 'BAD_REQUEST',
    });
  }

  req.body.message = trimmedMessage.replace(/\s+/g, ' ').replace(/\0/g, '');

  next();
}

/**
 * Session validation
 */
function validateSession(req, res, next) {
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({
      error: 'BAD_REQUEST',
    });
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  
  if (!uuidRegex.test(sessionId)) {
    return res.status(400).json({
      error: 'BAD_REQUEST',
    });
  }

  next();
}

/**
 * Content sanitization
 */
function sanitizeContent(req, res, next) {
  const { message } = req.body;

  const sanitized = message
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ''); // Strip control chars only, preserve Unicode/multilingual text

  req.body.message = sanitized;
  
  next();
}

/**
 * Spam detection
 */
function detectSpam(req, res, next) {
  const { message } = req.body;

  const repeatedCharsPattern = /(.)\1{10,}/g;
  if (repeatedCharsPattern.test(message)) {
    logger.warn('Spam detected: repeated characters', {
      messagePreview: message.substring(0, 100)
    });
    
    return res.status(400).json({
      error: 'BAD_REQUEST',
    });
  }

  const capsRatio = (message.match(/[A-Z]/g) || []).length / message.length;
  if (capsRatio > 0.7 && message.length > 20) {
    logger.warn('Spam detected: excessive caps', {
      capsRatio,
      messagePreview: message.substring(0, 100)
    });
  }

  next();
}

module.exports = {
  validateMessage,
  validateSession,
  sanitizeContent,
  detectSpam,
};
