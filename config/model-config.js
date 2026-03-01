/**
 * LLaMA Model Configuration
 * Settings for the locally-run medical AI chatbot
 */

const path = require('path');

// Model Settings - modelPath only needed if AUTO_START_LLAMA=true
// const os = require('os');
// const expandPath = (p) => p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;

module.exports = {
  // Safety Mode Toggle (true = full medical safety, false = fast plain mode)
  safetyMode: process.env.MEDICAL_SAFETY_MODE === 'true',

  // Server Configuration (llama-server managed by mdsystem-ai.service)
  llamaServer: {
    host: process.env.LLAMA_SERVER_HOST || 'localhost',
    port: process.env.LLAMA_SERVER_PORT || 8080,
    timeout: parseInt(process.env.LLAMA_REQUEST_TIMEOUT || '300000', 10),
    healthCheckTimeout: parseInt(process.env.LLAMA_HEALTH_CHECK_TIMEOUT || '120000', 10),
  },

  // On-Demand disabled — llama is externally managed
  onDemand: {
    enabled: false,
  },

  // Generation Parameters
  generationParams: {
    temperature: 0.4,
    topP: 0.85,
    topK: 20,
    repeatPenalty: 1.15,
    maxTokens: 300,
    contextSize: 4096,
    stop: ['\n\nUser:', '\n\nHuman:', 'User:', 'Human:'],
  },

  // System Prompt for SAFETY MODE — kept short for small model context window
  systemPrompt: 'You are a medical support assistant. Provide general health info only. Never diagnose, prescribe, or give treatment plans. For emergencies (chest pain, breathing issues, severe bleeding, suicidal thoughts), direct to emergency services immediately. Decline non-health topics.',

  // No system prompt for FAST MODE — raw passthrough to the model
  systemPromptFast: '',

  // Retry Configuration
  retry: {
    maxAttempts: 3,
    delayMs: 1000,
  },
};
