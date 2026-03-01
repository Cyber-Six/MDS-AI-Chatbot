/**
 * Chat Routes (Standalone Microservice)
 * 
 * Routes are organized into:
 * - /patient/* — Patient-facing endpoints (rate limited, API key required)
 * - /staff/*   — Staff-facing endpoints (staff identity from proxy headers, API key required)
 * - /health    — Health check (API key required)
 */

const express = require('express');
const router = express.Router();

const chatController = require('../controllers/chat-controller');
const handoffController = require('../controllers/handoff-controller');

const { validateMessage, validateSession, sanitizeContent, detectSpam } = require('../middleware/safety-filter');
const { emergencyDetectorMiddleware } = require('../middleware/emergency-detector');
const { extractStaffIdentity } = require('../middleware/staff-identity');
const { patientChatLimiter, staffChatLimiter } = require('../middleware/rate-limiter');

// ============================================
// Patient Chat Endpoints
// ============================================

router.post('/patient/session/new', 
  patientChatLimiter,
  chatController.createSession
);

router.post('/patient/message',
  patientChatLimiter,
  validateSession,
  validateMessage,
  sanitizeContent,
  detectSpam,
  emergencyDetectorMiddleware,
  chatController.sendMessage
);

router.post('/patient/message/stream',
  patientChatLimiter,
  validateSession,
  validateMessage,
  sanitizeContent,
  detectSpam,
  emergencyDetectorMiddleware,
  chatController.sendMessageStream
);

router.post('/patient/cancel',
  patientChatLimiter,
  validateSession,
  chatController.cancelGeneration
);

router.get('/patient/history/:sessionId', 
  patientChatLimiter,
  chatController.getHistory
);

router.delete('/patient/session/:sessionId', 
  patientChatLimiter,
  chatController.closeSession
);

// ============================================
// Staff Endpoints (Protected via proxy headers)
// ============================================
// Staff identity is injected by the backend proxy via X-Staff-Id / X-Staff-Role headers.
// The API key middleware (applied globally) ensures only trusted backends can set these.

router.get('/staff/active', 
  staffChatLimiter,
  extractStaffIdentity,
  handoffController.getActiveChats
);

router.get('/staff/handoffs', 
  staffChatLimiter,
  extractStaffIdentity,
  handoffController.getPendingHandoffs
);

router.post('/staff/takeover', 
  staffChatLimiter,
  extractStaffIdentity,
  handoffController.takeoverChat
);

router.post('/staff/release', 
  staffChatLimiter,
  extractStaffIdentity,
  handoffController.releaseChat
);

router.post('/staff/message',
  staffChatLimiter,
  extractStaffIdentity,
  validateMessage,
  sanitizeContent,
  handoffController.sendStaffMessage
);

router.get('/staff/transcript/:sessionId', 
  staffChatLimiter,
  extractStaffIdentity,
  handoffController.getTranscript
);

// ============================================
// Health Check (API key required)
// ============================================

router.get('/health', async (req, res) => {
  const llamaService = require('../services/llama-service');
  
  try {
    const isHealthy = await llamaService.healthCheck();

    res.json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'unavailable',
      timestamp: new Date().toISOString(),
    });
  }
});

module.exports = router;
