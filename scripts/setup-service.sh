#!/bin/bash
# ============================================
# MDS-AI-Chatbot Systemd Service Setup
# ============================================
# Run with sudo on the server that will host the chatbot
# Usage: sudo bash setup-service.sh

set -e

SERVICE_NAME="mds-ai-chatbot"
SERVICE_USER="${1:-$USER}"
WORKING_DIR="${2:-$(cd "$(dirname "$0")/.." && pwd)}"
NODE_BIN="$(which node)"

echo "Setting up ${SERVICE_NAME} systemd service..."
echo "  User: ${SERVICE_USER}"
echo "  Dir:  ${WORKING_DIR}"
echo "  Node: ${NODE_BIN}"

# Create systemd service file
cat > /etc/systemd/system/${SERVICE_NAME}.service << EOF
[Unit]
Description=MDS-AI-Chatbot Microservice
Documentation=https://github.com/K1taru/MDS-AI-Chatbot
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${WORKING_DIR}
ExecStart=${NODE_BIN} server.js
Restart=on-failure
RestartSec=10
StandardOutput=inherit
StandardError=inherit

# Environment
EnvironmentFile=${WORKING_DIR}/.env

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=${WORKING_DIR}/logs

# Resource limits
LimitNOFILE=65535
MemoryMax=2G

[Install]
WantedBy=multi-user.target
EOF

# Create logs directory
mkdir -p "${WORKING_DIR}/logs"
chown "${SERVICE_USER}:${SERVICE_USER}" "${WORKING_DIR}/logs"

# Reload systemd and enable service
systemctl daemon-reload
systemctl enable ${SERVICE_NAME}.service

echo ""
echo "✅ Service created: ${SERVICE_NAME}.service"
echo ""
echo "Commands:"
echo "  Start:   sudo systemctl start ${SERVICE_NAME}"
echo "  Stop:    sudo systemctl stop ${SERVICE_NAME}"
echo "  Status:  sudo systemctl status ${SERVICE_NAME}"
echo "  Logs:    sudo journalctl -u ${SERVICE_NAME} -f"
echo "  Restart: sudo systemctl restart ${SERVICE_NAME}"
echo ""
echo "Don't forget to:"
echo "  1. Copy .env.example to .env and fill in values"
echo "  2. Run 'npm install' in ${WORKING_DIR}"
echo "  3. Set up the database: psql -d mds_chatbot -f scripts/setup-db.sql"
echo "  4. Start the service: sudo systemctl start ${SERVICE_NAME}"
