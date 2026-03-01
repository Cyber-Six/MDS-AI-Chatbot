#!/bin/bash
# ============================================
# MDS-AI-Chatbot Database Setup Script
# ============================================
# Run on the database server to initialize the chatbot database
# Usage: bash setup-db.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "============================================"
echo "  MDS-AI-Chatbot Database Setup"
echo "============================================"
echo ""

cd "${PROJECT_DIR}"

# Check if .env exists
if [ ! -f .env ]; then
  echo "❌ .env file not found! Copy .env.example and fill in database values."
  exit 1
fi

# Read database config from .env safely using bash source
# set -a exports all variables, source loads .env, set +a stops exporting
set -a
source .env
set +a

# Strip quotes from CHATBOT_DB_PASSWORD (source .env includes literal single quotes)
CHATBOT_DB_PASSWORD="${CHATBOT_DB_PASSWORD#\'}"
CHATBOT_DB_PASSWORD="${CHATBOT_DB_PASSWORD%\'}"

# Use defaults if not set
CHATBOT_DB_HOST=${CHATBOT_DB_HOST:-localhost}
CHATBOT_DB_PORT=${CHATBOT_DB_PORT:-5432}
CHATBOT_DB_NAME=${CHATBOT_DB_NAME:-mds_chatbot}

echo "📋 Database Configuration:"
echo "   Host: ${CHATBOT_DB_HOST}:${CHATBOT_DB_PORT}"
echo "   Database: ${CHATBOT_DB_NAME}"
echo "   User: ${CHATBOT_DB_USER}"
echo ""

# Check PostgreSQL connectivity (connect to postgres system db to avoid "db not found" error)
echo "🔍 Checking PostgreSQL connectivity..."
if ! PGPASSWORD="${CHATBOT_DB_PASSWORD}" psql -h "${CHATBOT_DB_HOST}" -p "${CHATBOT_DB_PORT}" -U "${CHATBOT_DB_USER}" -d postgres -tc "SELECT 1" >/dev/null 2>&1; then
  echo "❌ Cannot connect to PostgreSQL at ${CHATBOT_DB_HOST}:${CHATBOT_DB_PORT} as user ${CHATBOT_DB_USER}"
  echo "   Check your .env settings and that PostgreSQL is running."
  exit 1
fi
echo "✅ PostgreSQL connection OK"
echo ""

# Create database if it doesn't exist
echo "📦 Creating database '${CHATBOT_DB_NAME}' if not exists..."
PGPASSWORD="${CHATBOT_DB_PASSWORD}" createdb -h "${CHATBOT_DB_HOST}" -p "${CHATBOT_DB_PORT}" -U "${CHATBOT_DB_USER}" "${CHATBOT_DB_NAME}" 2>/dev/null || echo "   (Database already exists)"
echo ""

# Run setup script
echo "🏗️  Running database schema setup..."
if [ -f scripts/setup-db.sql ]; then
  PGPASSWORD="${CHATBOT_DB_PASSWORD}" psql -h "${CHATBOT_DB_HOST}" -p "${CHATBOT_DB_PORT}" -U "${CHATBOT_DB_USER}" -d "${CHATBOT_DB_NAME}" -f scripts/setup-db.sql
  echo "✅ Database schema created"
else
  echo "❌ scripts/setup-db.sql not found!"
  exit 1
fi
echo ""

# Optional: Run migrations if they exist
if [ -f scripts/migrate-data.sql ]; then
  read -p "Run data migrations? (y/N) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🔄 Running migrations..."
    PGPASSWORD="${CHATBOT_DB_PASSWORD}" psql -h "${CHATBOT_DB_HOST}" -p "${CHATBOT_DB_PORT}" -U "${CHATBOT_DB_USER}" -d "${CHATBOT_DB_NAME}" -f scripts/migrate-data.sql
    echo "✅ Migrations completed"
  fi
fi
echo ""

# Verify setup
echo "✅ Verifying database setup..."
PGPASSWORD="${CHATBOT_DB_PASSWORD}" psql -h "${CHATBOT_DB_HOST}" -p "${CHATBOT_DB_PORT}" -U "${CHATBOT_DB_USER}" -d "${CHATBOT_DB_NAME}" -c "
  SELECT 
    COUNT(*) as table_count,
    ARRAY_AGG(tablename) as tables
  FROM pg_tables 
  WHERE schemaname = 'public'
" | head -5
echo ""

echo "============================================"
echo "  Database setup complete!"
echo "============================================"
