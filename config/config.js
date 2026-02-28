const config = {
  // Server
  port: parseInt(process.env.CHATBOT_PORT, 10) || 4000,
  host: process.env.CHATBOT_HOST || '0.0.0.0',

  // API Key for service-to-service auth
  apiKey: process.env.CHATBOT_API_KEY,

  // Database
  db: {
    host: process.env.CHATBOT_DB_HOST || 'localhost',
    port: parseInt(process.env.CHATBOT_DB_PORT, 10) || 5432,
    name: process.env.CHATBOT_DB_NAME || 'mds_chatbot',
    user: process.env.CHATBOT_DB_USER,
    password: process.env.CHATBOT_DB_PASSWORD,
    max: parseInt(process.env.CHATBOT_DB_MAX_CONN, 10) || 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  },

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',
  logDir: process.env.LOGGER_DIR || 'logs',

  // Rate limiting
  patientRateLimit: {
    windowMs: parseInt(process.env.PATIENT_RATE_LIMIT_WINDOW_MS, 10) || 60000,
    max: parseInt(process.env.PATIENT_RATE_LIMIT_MAX, 10) || 20,
  },
  staffRateLimit: {
    windowMs: parseInt(process.env.STAFF_RATE_LIMIT_WINDOW_MS, 10) || 60000,
    max: parseInt(process.env.STAFF_RATE_LIMIT_MAX, 10) || 60,
  },

  // CORS
  corsOrigins: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
    : [],
};

// Fail-fast validation
if (!config.apiKey) {
  throw new Error('❌ Missing required config: CHATBOT_API_KEY in .env');
}

const requiredDbKeys = ['host', 'user', 'password', 'name'];
for (const key of requiredDbKeys) {
  if (!config.db[key]) {
    throw new Error(`❌ Missing required DB config: CHATBOT_DB_${key.toUpperCase()} in .env`);
  }
}

module.exports = config;
