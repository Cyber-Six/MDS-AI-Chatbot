#!/bin/bash
# ============================================
# MDS-AI-Chatbot Build & Deploy Script
# ============================================
# Run on the chatbot server to update and deploy
# Usage: bash deploy.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SERVICE_NAME="mds-ai-chatbot"

echo "============================================"
echo "  MDS-AI-Chatbot Deployment"
echo "============================================"
echo ""

cd "${PROJECT_DIR}"

# Pull latest code (if using git)
if [ -d .git ]; then
  echo "📥 Pulling latest code..."
  git pull
  echo ""
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install --production
echo ""

# Syntax check
echo "🔍 Syntax checking server.js..."
node --check server.js
echo "✅ Syntax OK"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
  echo "❌ .env file not found! Copy .env.example and fill in values."
  exit 1
fi

# Restart service
echo "🔄 Restarting ${SERVICE_NAME} service..."
sudo systemctl restart ${SERVICE_NAME}

# Wait a moment and check status
sleep 2
if systemctl is-active --quiet ${SERVICE_NAME}; then
  echo "✅ ${SERVICE_NAME} is running"
  
  # Quick health check
  PORT=$(grep CHATBOT_PORT .env | cut -d'=' -f2 | tr -d ' ')
  PORT=${PORT:-4000}
  
  echo "🏥 Health check..."
  if curl -s "http://localhost:${PORT}/api/health" | grep -q '"status"'; then
    echo "✅ Health check passed"
  else
    echo "⚠️ Health check failed (LLaMA server may not be running)"
  fi
else
  echo "❌ ${SERVICE_NAME} failed to start"
  echo "Check logs: sudo journalctl -u ${SERVICE_NAME} --no-pager -n 50"
  exit 1
fi

echo ""
echo "============================================"
echo "  Deployment complete!"
echo "============================================"
