-- ============================================
-- MDS-AI-Chatbot Database Setup
-- ============================================
-- Run this script to create the chatbot's own database and tables.
-- Execute as a PostgreSQL superuser or the designated DB user.
--
-- Usage:
--   1. Create the database:  createdb mds_chatbot
--   2. Run this script:      psql -d mds_chatbot -f setup-db.sql
-- ============================================

-- ============================================
-- Tables
-- ============================================

CREATE TABLE IF NOT EXISTS ai_conversations (
  id              SERIAL PRIMARY KEY,
  session_id      UUID NOT NULL UNIQUE,
  patient_id      INTEGER,                   -- nullable for anonymous users
  status          VARCHAR(20) NOT NULL DEFAULT 'ai-active',
  staff_id        INTEGER,                   -- set when staff takes over
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  closed_at       TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_session_id ON ai_conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_status ON ai_conversations(status);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_patient_id ON ai_conversations(patient_id);

CREATE TABLE IF NOT EXISTS ai_messages (
  id              SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role            VARCHAR(20) NOT NULL,      -- 'user', 'assistant', 'system', 'staff'
  content         TEXT NOT NULL,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_id ON ai_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_messages_created_at ON ai_messages(created_at);

CREATE TABLE IF NOT EXISTS ai_handoff_requests (
  id                SERIAL PRIMARY KEY,
  conversation_id   INTEGER NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  reason            TEXT NOT NULL,
  priority          VARCHAR(20) NOT NULL DEFAULT 'normal',  -- 'emergency', 'high', 'normal', 'low'
  status            VARCHAR(20) NOT NULL DEFAULT 'pending',  -- 'pending', 'assigned', 'resolved'
  assigned_staff_id INTEGER,
  assigned_at       TIMESTAMP WITH TIME ZONE,
  resolved_at       TIMESTAMP WITH TIME ZONE,
  created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_handoff_requests_status ON ai_handoff_requests(status);
CREATE INDEX IF NOT EXISTS idx_ai_handoff_requests_priority ON ai_handoff_requests(priority);
CREATE INDEX IF NOT EXISTS idx_ai_handoff_requests_conversation_id ON ai_handoff_requests(conversation_id);

-- ============================================
-- Views
-- ============================================

-- Active conversations with message counts
CREATE OR REPLACE VIEW v_active_chats AS
SELECT 
  c.id,
  c.session_id,
  c.patient_id,
  c.status,
  c.staff_id,
  c.created_at,
  c.updated_at,
  COUNT(m.id) as message_count,
  MAX(m.created_at) as last_message_at
FROM ai_conversations c
LEFT JOIN ai_messages m ON c.id = m.conversation_id
WHERE c.status IN ('ai-active', 'staff-taken')
GROUP BY c.id
ORDER BY MAX(m.created_at) DESC;

-- Priority handoff queue
CREATE OR REPLACE VIEW v_handoff_queue AS
SELECT 
  hr.id as request_id,
  hr.conversation_id,
  hr.reason,
  hr.priority,
  hr.status as request_status,
  hr.created_at as requested_at,
  c.session_id,
  c.patient_id,
  c.status as conversation_status,
  (SELECT COUNT(*) FROM ai_messages WHERE conversation_id = c.id) as message_count
FROM ai_handoff_requests hr
JOIN ai_conversations c ON hr.conversation_id = c.id
WHERE hr.status = 'pending'
ORDER BY 
  CASE hr.priority
    WHEN 'emergency' THEN 1
    WHEN 'high' THEN 2
    WHEN 'normal' THEN 3
    WHEN 'low' THEN 4
  END,
  hr.created_at ASC;
