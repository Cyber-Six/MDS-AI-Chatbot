/**
 * Chat Controller
 * Handles chat requests and orchestrates AI responses with safety checks
 */

const llamaService = require('../services/llama-service');
const conversationService = require('../services/conversation-service');
const { detectEmergency, detectProhibitedTopic, validateResponse } = require('../middleware/emergency-detector');
const modelConfig = require('../config/model-config');
const logger = require('../utils/logger');
const db = require('../config/db');

// Check if safety mode is enabled
const isSafetyMode = modelConfig.safetyMode;

class ChatController {
  constructor() {
    // Track active streaming sessions for cancellation support
    this.activeSessions = new Map();
    
    this.cancelGeneration = this.cancelGeneration.bind(this);
    this.sendMessageStream = this.sendMessageStream.bind(this);
    this.sendMessage = this.sendMessage.bind(this);
    this.createSession = this.createSession.bind(this);
    this.getHistory = this.getHistory.bind(this);
    this.closeSession = this.closeSession.bind(this);
  }

  /**
   * Cancel ongoing message generation for a session
   */
  async cancelGeneration(req, res) {
    const { sessionId } = req.body;

    try {
      if (!sessionId) {
        return res.status(400).json({
          error: 'BAD_REQUEST',
        });
      }

      const sessionData = this.activeSessions.get(sessionId);

      if (!sessionData) {
        return res.json({
          success: true,
          message: 'No active generation to cancel'
        });
      }

      sessionData.isCancelled = true;
      sessionData.abortController.abort();

      logger.info('Generation cancelled by user', { sessionId });

      return res.json({
        success: true,
        message: 'Generation cancelled successfully'
      });

    } catch (error) {
      logger.error('Failed to cancel generation', {
        error: error.message,
        sessionId
      });

      return res.status(500).json({
        error: 'INTERNAL_ERROR',
      });
    }
  }

  /**
   * Handle new message and generate AI response
   */
  async sendMessage(req, res) {
    const { sessionId, message } = req.body;

    try {
      let conversation = await conversationService.getConversation(sessionId);

      if (!conversation) {
        return res.status(404).json({
          error: 'NOT_FOUND',
        });
      }

      if (conversation.status === 'staff-taken') {
        return res.status(403).json({
          error: 'FORBIDDEN',
        });
      }

      const limitsCheck = await conversationService.checkLimits(sessionId);
      if (limitsCheck.exceeded) {
        return res.status(429).json({
          error: 'RATE_LIMITED',
        });
      }

      await conversationService.addMessage(conversation.id, 'user', message, {});

      // FAST MODE: Skip all safety processing
      if (!isSafetyMode) {
        const contextMessages = await conversationService.getContextMessages(sessionId, 10);
        const aiResponse = await llamaService.generateResponse(contextMessages);

        await conversationService.addMessage(conversation.id, 'assistant', aiResponse.content, {
          tokens: aiResponse.tokens,
          duration: aiResponse.duration,
          fastMode: true,
        });

        return res.json({
          sessionId,
          message: aiResponse.content,
          role: 'assistant',
          metadata: { tokens: aiResponse.tokens, duration: aiResponse.duration },
          timestamp: new Date().toISOString(),
        });
      }

      // SAFETY MODE: Full emergency/prohibited detection
      const emergencyDetection = req.emergencyDetection || detectEmergency(message);
      const prohibitedDetection = req.prohibitedDetection || detectProhibitedTopic(message);

      if (emergencyDetection.isEmergency) {
        const emergencyMessage = emergencyDetection.response.message;
        
        await conversationService.addMessage(
          conversation.id,
          'assistant',
          emergencyMessage,
          {
            safetyOverride: true,
            emergencyResponse: true,
            priority: 'emergency',
          }
        );

        await this.createHandoffRequest(conversation.id, 'emergency', 'emergency');

        return res.json({
          sessionId,
          message: emergencyMessage,
          role: 'assistant',
          metadata: {},
          timestamp: new Date().toISOString(),
        });
      }

      if (prohibitedDetection.isProhibited) {
        const refusalMessage = prohibitedDetection.response.message;
        
        await conversationService.addMessage(
          conversation.id,
          'assistant',
          refusalMessage,
          {
            safetyOverride: true,
            refusal: true,
          }
        );

        return res.json({
          sessionId,
          message: refusalMessage,
          role: 'assistant',
          metadata: {},
          timestamp: new Date().toISOString(),
        });
      }

      const contextMessages = await conversationService.getContextMessages(sessionId, 10);

      logger.info('Generating AI response', { sessionId, messageLength: message.length });
      
      const aiResponse = await llamaService.generateResponse(contextMessages);

      const validation = validateResponse(aiResponse.content);

      let finalResponse = aiResponse.content;
      let responseMetadata = {
        tokens: aiResponse.tokens,
        duration: aiResponse.duration,
      };

      if (!validation.isValid) {
        logger.warn('AI response failed validation', {
          sessionId,
          violations: validation.violations,
          reason: validation.reason
        });

        finalResponse = 'I apologize, but I cannot provide a proper response to that. ' +
          'Please consult with a healthcare professional for appropriate guidance.';

        responseMetadata.safetyOverride = true;
      }

      if (emergencyDetection.isUrgent) {
        finalResponse = `${emergencyDetection.response.message}\n\n${finalResponse}`;
        responseMetadata.urgentGuidance = true;
      }

      await conversationService.addMessage(
        conversation.id,
        'assistant',
        finalResponse,
        responseMetadata
      );

      return res.json({
        sessionId,
        message: finalResponse,
        role: 'assistant',
        metadata: responseMetadata,
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      logger.error('Failed to process chat message', {
        error: error.message,
        sessionId,
        stack: error.stack
      });

      return res.status(500).json({
        error: 'INTERNAL_ERROR',
      });
    }
  }

  /**
   * Handle new message with streaming AI response (Server-Sent Events)
   */
  async sendMessageStream(req, res) {
    const { sessionId, message } = req.body;

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    
    res.flushHeaders();

    const abortController = new AbortController();
    let isCancelled = false;

    // SSE heartbeat keep-alive: send a named event every 15s to prevent
    // Cloudflare Tunnel / reverse-proxy idle-timeout disconnects (502).
    // Use a named event (not an SSE comment) since some CDN layers strip comments.
    const heartbeatInterval = setInterval(() => {
      if (!isCancelled && !res.writableEnded) {
        res.write('event: heartbeat\ndata: {}\n\n');
      }
    }, 15000);

    this.activeSessions.set(sessionId, {
      abortController,
      isCancelled: false
    });

    req.on('close', () => {
      clearInterval(heartbeatInterval);

      const sessionData = this.activeSessions.get(sessionId);
      if (sessionData && sessionData.isCancelled) {
        isCancelled = true;
      }
      
      if (!res.writableEnded) {
        logger.info('Client disconnected, cancelling streaming response', { sessionId });
        isCancelled = true;
        abortController.abort();
      }
    });

    const sendEvent = (event, data) => {
      if (!isCancelled && !res.writableEnded) {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      }
    };

    try {
      let conversation = await conversationService.getConversation(sessionId);

      if (!conversation) {
        sendEvent('error', { error: 'NOT_FOUND' });
        clearInterval(heartbeatInterval);
        return res.end();
      }

      if (conversation.status === 'staff-taken') {
        sendEvent('error', { error: 'FORBIDDEN' });
        clearInterval(heartbeatInterval);
        return res.end();
      }

      const limitsCheck = await conversationService.checkLimits(sessionId);
      if (limitsCheck.exceeded) {
        sendEvent('error', { error: 'RATE_LIMITED' });
        clearInterval(heartbeatInterval);
        return res.end();
      }

      await conversationService.addMessage(conversation.id, 'user', message, {});

      // FAST MODE
      if (!isSafetyMode) {
        const contextMessages = await conversationService.getContextMessages(sessionId, 10);
        
        sendEvent('start', { sessionId, timestamp: new Date().toISOString() });

        let fullContent = '';

        const aiResponse = await llamaService.generateStreamingResponse(
          contextMessages,
          { signal: abortController.signal },
          (token, isStop) => {
            if (!isCancelled) {
              fullContent += token;
              sendEvent('token', { token, content: fullContent });
            }
          }
        );

        if (!isCancelled) {
          await conversationService.addMessage(conversation.id, 'assistant', aiResponse.content, {
            tokens: aiResponse.tokens,
            duration: aiResponse.duration,
            fastMode: true,
            streamed: true,
          });

          sendEvent('done', {
            sessionId,
            message: aiResponse.content,
            role: 'assistant',
            metadata: {},
            timestamp: new Date().toISOString(),
          });
        }
        clearInterval(heartbeatInterval);
        return res.end();
      }

      // SAFETY MODE
      const emergencyDetection = req.emergencyDetection || detectEmergency(message);
      const prohibitedDetection = req.prohibitedDetection || detectProhibitedTopic(message);

      if (emergencyDetection.isEmergency) {
        const emergencyMessage = emergencyDetection.response.message;
        
        await conversationService.addMessage(
          conversation.id,
          'assistant',
          emergencyMessage,
          { safetyOverride: true, emergencyResponse: true, priority: 'emergency' }
        );

        await this.createHandoffRequest(conversation.id, 'emergency', 'emergency');

        sendEvent('start', { sessionId, timestamp: new Date().toISOString() });
        sendEvent('token', { token: emergencyMessage, content: emergencyMessage });
        sendEvent('done', {
          sessionId,
          message: emergencyMessage,
          role: 'assistant',
          metadata: { isEmergency: true, priority: 'emergency', handoffCreated: true },
          timestamp: new Date().toISOString(),
        });
        clearInterval(heartbeatInterval);
        return res.end();
      }

      if (prohibitedDetection.isProhibited) {
        const refusalMessage = prohibitedDetection.response.message;
        
        await conversationService.addMessage(
          conversation.id,
          'assistant',
          refusalMessage,
          { safetyOverride: true, refusal: true }
        );

        sendEvent('start', { sessionId, timestamp: new Date().toISOString() });
        sendEvent('token', { token: refusalMessage, content: refusalMessage });
        sendEvent('done', {
          sessionId,
          message: refusalMessage,
          role: 'assistant',
          metadata: { isRefusal: true },
          timestamp: new Date().toISOString(),
        });
        clearInterval(heartbeatInterval);
        return res.end();
      }

      const contextMessages = await conversationService.getContextMessages(sessionId, 10);

      sendEvent('start', { sessionId, timestamp: new Date().toISOString() });

      logger.info('Generating streaming AI response', { sessionId, messageLength: message.length });

      let fullContent = '';
      let urgentPrefix = '';

      if (emergencyDetection.isUrgent) {
        urgentPrefix = emergencyDetection.response.message + '\n\n';
        sendEvent('token', { token: urgentPrefix, content: urgentPrefix });
        fullContent = urgentPrefix;
      }

      const aiResponse = await llamaService.generateStreamingResponse(
        contextMessages,
        { signal: abortController.signal },
        (token, isStop) => {
          if (!isCancelled) {
            fullContent += token;
            sendEvent('token', { token, content: fullContent });
          }
        }
      );

      const validation = validateResponse(aiResponse.content);

      let finalResponse = urgentPrefix + aiResponse.content;
      let responseMetadata = {
        tokens: aiResponse.tokens,
        duration: aiResponse.duration,
        model: aiResponse.model,
        validated: validation.isValid,
        streamed: true,
      };

      if (!validation.isValid) {
        logger.warn('AI streaming response failed validation', {
          sessionId,
          violations: validation.violations,
          reason: validation.reason
        });

        finalResponse = 'I apologize, but I cannot provide a proper response to that. ' +
          'Please consult with a healthcare professional for appropriate guidance.';

        responseMetadata.safetyOverride = true;
        responseMetadata.validationFailed = true;
      }

      if (emergencyDetection.isUrgent) {
        responseMetadata.urgentGuidance = true;
      }

      if (!isCancelled) {
        await conversationService.addMessage(
          conversation.id,
          'assistant',
          finalResponse,
          responseMetadata
        );

        sendEvent('done', {
          sessionId,
          message: finalResponse,
          role: 'assistant',
          metadata: responseMetadata,
          timestamp: new Date().toISOString(),
        });
      }

      this.activeSessions.delete(sessionId);
      clearInterval(heartbeatInterval);

      return res.end();

    } catch (error) {
      this.activeSessions.delete(sessionId);
      clearInterval(heartbeatInterval);
      
      if (error.name === 'AbortError' || isCancelled) {
        logger.info('Streaming request cancelled by client', { sessionId });
        return res.end();
      }

      logger.error('Failed to process streaming chat message', {
        error: error.message,
        sessionId,
        stack: error.stack
      });

      sendEvent('error', {
        error: 'INTERNAL_ERROR',
      });
      return res.end();
    }
  }

  /**
   * Create new chat session
   */
  async createSession(req, res) {
    try {
      const patientId = req.user?.id || null;

      const session = await conversationService.createSession(patientId);

      return res.json({
        success: true,
        session,
      });

    } catch (error) {
      logger.error('Failed to create chat session', { error: error.message });

      return res.status(500).json({
        error: 'INTERNAL_ERROR',
      });
    }
  }

  /**
   * Get conversation history
   */
  async getHistory(req, res) {
    const { sessionId } = req.params;

    try {
      const history = await conversationService.getHistory(sessionId);

      return res.json({
        sessionId,
        messages: history,
        count: history.length,
      });

    } catch (error) {
      logger.error('Failed to get chat history', {
        error: error.message,
        sessionId
      });

      return res.status(500).json({
        error: 'INTERNAL_ERROR',
      });
    }
  }

  /**
   * Clear/close conversation
   */
  async closeSession(req, res) {
    const { sessionId } = req.params;

    try {
      await conversationService.closeConversation(sessionId);

      return res.json({
        success: true,
        message: 'Conversation closed successfully',
      });

    } catch (error) {
      logger.error('Failed to close conversation', {
        error: error.message,
        sessionId
      });

      return res.status(500).json({
        error: 'INTERNAL_ERROR',
      });
    }
  }

  /**
   * Helper: Create handoff request to staff
   */
  async createHandoffRequest(conversationId, reason, priority = 'normal') {
    try {
      const query = `
        INSERT INTO ai_handoff_requests (conversation_id, reason, priority, status, created_at)
        VALUES ($1, $2, $3, 'pending', NOW())
        RETURNING *
      `;

      const result = await db.query(query, [conversationId, reason, priority]);

      logger.info('Handoff request created', {
        conversationId,
        reason,
        priority,
        requestId: result.rows[0].id
      });

      return result.rows[0];

    } catch (error) {
      logger.error('Failed to create handoff request', {
        error: error.message,
        conversationId
      });
      throw error;
    }
  }
}

module.exports = new ChatController();
