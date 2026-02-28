-- ============================================
-- Migrate chatbot data from shared mdsystem DB
-- to the new standalone mds_chatbot DB
-- ============================================
-- 
-- IMPORTANT: Run this AFTER setup-db.sql has created the tables
--
-- Step 1: Export from mdsystem DB
--   pg_dump -d mdsystem -t ai_conversations -t ai_messages -t ai_handoff_requests --data-only -f chatbot_data.sql
--
-- Step 2: Import into mds_chatbot DB
--   psql -d mds_chatbot -f chatbot_data.sql
--
-- Step 3: Fix sequences (after data import)
--   Run the commands below in the mds_chatbot database:

SELECT setval('ai_conversations_id_seq', COALESCE((SELECT MAX(id) FROM ai_conversations), 0) + 1, false);
SELECT setval('ai_messages_id_seq', COALESCE((SELECT MAX(id) FROM ai_messages), 0) + 1, false);
SELECT setval('ai_handoff_requests_id_seq', COALESCE((SELECT MAX(id) FROM ai_handoff_requests), 0) + 1, false);

-- Step 4: Verify
SELECT 'ai_conversations' as table_name, COUNT(*) as row_count FROM ai_conversations
UNION ALL
SELECT 'ai_messages', COUNT(*) FROM ai_messages
UNION ALL
SELECT 'ai_handoff_requests', COUNT(*) FROM ai_handoff_requests;

-- Step 5: (After verifying) Drop tables from mdsystem DB
-- WARNING: Only run this after confirming the migration was successful!
-- 
-- psql -d mdsystem -c "DROP VIEW IF EXISTS v_active_chats, v_handoff_queue CASCADE;"
-- psql -d mdsystem -c "DROP TABLE IF EXISTS ai_handoff_requests, ai_messages, ai_conversations CASCADE;"
