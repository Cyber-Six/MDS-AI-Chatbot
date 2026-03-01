/**
 * Staff Identity Middleware
 * Extracts trusted staff identity from headers set by the backend proxy.
 * 
 * The main backend validates JWT and injects:
 *   X-Staff-Id: <user id>
 *   X-Staff-Role: <role>
 * 
 * These are only trusted when the request also has a valid X-API-Key
 * (validated by apiKeyAuth middleware that runs before this).
 */

const logger = require('../utils/logger');

function extractStaffIdentity(req, res, next) {
  const staffId = req.headers['x-staff-id'];
  const staffRole = req.headers['x-staff-role'];

  if (!staffId) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
    });
  }

  // Attach staff info to request (mimics req.user from JWT)
  req.user = {
    id: parseInt(staffId, 10) || staffId,
    role: staffRole || 'medical',
  };

  logger.debug('Staff identity extracted from proxy headers', {
    staffId: req.user.id,
    staffRole: req.user.role,
    path: req.path,
  });

  next();
}

module.exports = { extractStaffIdentity };
