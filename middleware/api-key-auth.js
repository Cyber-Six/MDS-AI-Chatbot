/**
 * API Key Authentication Middleware
 * Validates X-API-Key header for service-to-service communication
 */

const config = require('../config/config');
const logger = require('../utils/logger');

/**
 * Middleware that requires a valid API key in the X-API-Key header.
 * Used to authenticate requests from the main backend proxy.
 * 
 * @param {Object} options
 * @param {string[]} [options.exemptPaths] - Paths that don't require API key (e.g. /health)
 */
function apiKeyAuth(options = {}) {
  const { exemptPaths = [] } = options;

  return (req, res, next) => {
    // Propagate request ID from proxy for traceability
    if (req.headers['x-request-id']) {
      req.requestId = req.headers['x-request-id'];
    }

    // Skip auth for exempt paths
    if (exemptPaths.some(p => req.path === p || req.path.startsWith(p))) {
      return next();
    }

    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
      logger.warn('Request missing X-API-Key header', {
        ip: req.ip,
        path: req.path,
        method: req.method,
      });

      return res.status(401).json({
        error: 'UNAUTHORIZED',
      });
    }

    if (apiKey !== config.apiKey) {
      logger.warn('Invalid API key received', {
        ip: req.ip,
        path: req.path,
        method: req.method,
      });

      return res.status(401).json({
        error: 'UNAUTHORIZED',
      });
    }

    next();
  };
}

module.exports = { apiKeyAuth };
