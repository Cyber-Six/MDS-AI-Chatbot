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

# Read database config from .env
DB_HOST=$(grep CHATBOT_DB_HOST .env | cut -d'=' -f2 | tr -d " '")
DB_PORT=$(grep CHATBOT_DB_PORT .env | cut -d'=' -f2 | tr -d " '")
DB_USER=$(grep CHATBOT_DB_USER .env | cut -d'=' -f2 | tr -d " '")
DB_PASSWORD=$(grep CHATBOT_DB_PASSWORD .env | cut -d'=' -f2 | tr -d " '")
DB_NAME=$(grep CHATBOT_DB_NAME .env | cut -d'=' -f2 | tr -d " '")

# Use defaults if not set
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-mds_chatbot}

echo "📋 Database Configuration:"
echo "   Host: ${DB_HOST}:${DB_PORT}"
echo "   Database: ${DB_NAME}"
echo "   User: ${DB_USER}"
echo ""

# Check PostgreSQL connectivity
echo "🔍 Checking PostgreSQL connectivity..."
if ! PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -tc "SELECT 1" >/dev/null 2>&1; then
  echo "❌ Cannot connect to PostgreSQL at ${DB_HOST}:${DB_PORT} as user ${DB_USER}"
  echo "   Check your .env settings and PostgreSQL is running."
  exit 1
fi
echo "✅ PostgreSQL connection OK"
echo ""

# Create database if it doesn't exist
echo "📦 Creating database '${DB_NAME}' if not exists..."
PGPASSWORD="${DB_PASSWORD}" createdb -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" "${DB_NAME}" 2>/dev/null || echo "   (Database already exists)"
echo ""

# Run setup script
echo "🏗️  Running database schema setup..."
if [ -f scripts/setup-db.sql ]; then
  PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -f scripts/setup-db.sql
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
    PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -f scripts/migrate-data.sql
    echo "✅ Migrations completed"
  fi
fi
echo ""

# Verify setup
echo "✅ Verifying database setup..."
PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -c "
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
