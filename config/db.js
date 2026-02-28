const { Pool } = require('pg');
const { db: dbConfig } = require('./config');
const logger = require('../utils/logger');

const pool = new Pool({
  host: dbConfig.host,
  user: dbConfig.user,
  password: dbConfig.password,
  database: dbConfig.name,
  port: dbConfig.port,
  max: dbConfig.max,
  idleTimeoutMillis: dbConfig.idleTimeoutMillis,
  connectionTimeoutMillis: dbConfig.connectionTimeoutMillis,
});

// Log first connection only; subsequent pool connections use debug level
let firstConnect = true;
pool.on('connect', () => {
  if (firstConnect) {
    logger.info('✅ Connected to Chatbot Postgres DB');
    firstConnect = false;
  } else {
    logger.debug('New PG pool connection acquired');
  }
});

pool.on('error', (err) => {
  logger.error('❌ Unexpected Postgres error on chatbot DB', { error: err.message });
  process.exit(-1);
});

module.exports = pool;
