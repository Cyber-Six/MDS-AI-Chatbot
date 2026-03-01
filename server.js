/**
 * MDS-AI-Chatbot Microservice - Entry Point
 * 
 * Standalone Express server for the MDS AI Medical Chatbot.
 * Designed to run independently from the main MDSystem backend.
 * 
 * Architecture:
 * - Backend servers (www/www2) proxy /econsultation/chat/* requests here
 * - API key authentication ensures only trusted backends can call this service
 * - If co-located on the same server, uses localhost for minimal latency
 * - If on a different server, accessed via https://ai.mdsystemtip.space
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

// Load env before config
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const config = require('./config/config');
const logger = require('./utils/logger');
const { apiKeyAuth } = require('./middleware/api-key-auth');
const chatRoutes = require('./routes/chat-routes');
const llamaService = require('./services/llama-service');

const app = express();

// ============================================
// Global Middleware
// ============================================

// Security headers
app.use(helmet());

// CORS — restrict to allowed origins only
if (config.corsOrigins.length > 0) {
  app.use(cors({
    origin: config.corsOrigins,
    credentials: true,
  }));
} else {
  // No origins configured — reject all cross-origin requests
  app.use(cors({
    origin: false,
  }));
}

// Body parsing
app.use(express.json());
app.set('trust proxy', true);

// Ensure req.body is always an object
app.use((req, res, next) => {
  if (req.body === undefined) {
    req.body = {};
  }
  next();
});

// Global handler for malformed JSON
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      error: 'INVALID_JSON',
      message: 'The JSON body is malformed or invalid.',
    });
  }
  next();
});

// ============================================
// API Key Authentication
// ============================================
// ALL routes require X-API-Key header — no exceptions
app.use('/api', apiKeyAuth({ exemptPaths: [] }));

// ============================================
// Routes
// ============================================
app.use('/api', chatRoutes);

// Root route — minimal response, no service info exposed
app.get('/', (req, res) => {
  res.status(404).json({ error: 'NOT_FOUND' });
});

// ============================================
// Initialize LLaMA Service & Start Server
// ============================================

async function start() {
  try {
    logger.info('Starting MDS-AI-Chatbot Microservice...');

    // Initialize llama.cpp connection
    const autoStart = process.env.AUTO_START_LLAMA === 'true';
    const initialized = await llamaService.initialize(autoStart);

    if (initialized) {
      logger.info('✅ LLaMA service initialized');
    } else {
      logger.warn('⚠️ LLaMA service not available — endpoints will return errors until it starts');
    }

    // Start HTTP server
    const server = app.listen(config.port, config.host, () => {
      logger.info(`✅ MDS-AI-Chatbot Microservice running on ${config.host}:${config.port}`);
      logger.info(`   Health check: http://${config.host}:${config.port}/api/health`);
    });

    // Graceful shutdown
    const shutdown = async (signal) => {
      logger.info(`${signal} received, shutting down gracefully...`);

      await llamaService.shutdown();
      
      server.close(() => {
        logger.info('MDS-AI-Chatbot Microservice shut down');
        process.exit(0);
      });

      // Force exit after 30s
      setTimeout(() => {
        logger.error('Forced exit after timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start MDS-AI-Chatbot Microservice', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
}

start();

module.exports = app; // For testing
