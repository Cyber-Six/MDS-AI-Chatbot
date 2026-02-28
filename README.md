# MDS-AI-Chatbot

AI Medical Chatbot Microservice for MDSystem.

## Architecture

This is a standalone microservice that provides AI-powered medical chat functionality. It runs independently from the main MDSystem backend and can be deployed on any server.

```
Frontend (mds-patient/mds-staff)
    │
    ▼
Backend (www/www2)  ──── /econsultation/chat/* ────►  MDS-AI-Chatbot (this service)
    │                    X-API-Key header                    │
    │                    X-Staff-Id (for staff routes)       ▼
    │                                                  llama.cpp server
    │                                                  (localhost:8080)
    ▼
  PostgreSQL (mdsystem)                              PostgreSQL (mds_chatbot)
```

### Key Design Decisions

- **Backend proxy pattern**: Frontends never call the chatbot directly. The main backend proxies `/econsultation/chat/*` requests, injecting an API key for authentication.
- **Localhost optimization**: If the chatbot is running on the same server, `CHATBOT_URL=http://localhost:4000` avoids any internet round-trip.
- **Remote fallback**: Servers without a local chatbot set `CHATBOT_URL=https://ai.mdsystemtip.space` to reach it over the network.
- **Zero frontend changes**: The patient and staff portals keep calling the same `/econsultation/chat/*` endpoints.

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your values
```

Key environment variables:
- `CHATBOT_API_KEY` — Shared secret (must match the backend's `CHATBOT_API_KEY`)
- `CHATBOT_DB_*` — PostgreSQL connection for the chatbot database
- `LLAMA_SERVER_HOST` / `LLAMA_SERVER_PORT` — LLaMA inference server location

### 3. Set Up Database

```bash
createdb mds_chatbot
psql -d mds_chatbot -f scripts/setup-db.sql
```

To migrate existing data from the shared database:
```bash
# Export from mdsystem
pg_dump -d mdsystem -t ai_conversations -t ai_messages -t ai_handoff_requests --data-only -f chatbot_data.sql

# Import into mds_chatbot
psql -d mds_chatbot -f chatbot_data.sql
psql -d mds_chatbot -f scripts/migrate-data.sql
```

### 4. Start the Service

```bash
# Development
npm run dev

# Production
npm start

# Or with systemd
sudo bash scripts/setup-service.sh
sudo systemctl start mds-ai-chatbot
```

### 5. Configure Backend Proxy

Add to the Backend `.env` on each server:

```env
# Server with chatbot running locally (fast path)
CHATBOT_URL=http://localhost:4000
CHATBOT_API_KEY=<same-key-as-chatbot>

# Server WITHOUT chatbot (remote path)
CHATBOT_URL=https://ai.mdsystemtip.space
CHATBOT_API_KEY=<same-key-as-chatbot>
```

## API Endpoints

All endpoints are prefixed with `/api` and require `X-API-Key` header (except `/api/health`).

### Patient Endpoints (`/api/patient/*`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/patient/session/new` | Create new chat session |
| POST | `/api/patient/message` | Send message, get AI response |
| POST | `/api/patient/message/stream` | Send message, get SSE streaming response |
| POST | `/api/patient/cancel` | Cancel ongoing generation |
| GET | `/api/patient/history/:sessionId` | Get conversation history |
| DELETE | `/api/patient/session/:sessionId` | Close/clear session |

### Staff Endpoints (`/api/staff/*`)

Require `X-Staff-Id` and `X-Staff-Role` headers (injected by backend proxy after JWT validation).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/staff/active` | Get active conversations |
| GET | `/api/staff/handoffs` | Get pending handoff requests |
| POST | `/api/staff/takeover` | Take over AI conversation |
| POST | `/api/staff/release` | Release back to AI |
| POST | `/api/staff/message` | Send staff message |
| GET | `/api/staff/transcript/:sessionId` | Get full transcript |

### System

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check (no API key required) |

## Deployment

```bash
bash scripts/deploy.sh
```

## LLaMA Server

The chatbot communicates with a llama.cpp HTTP server for inference.

- **Co-located**: Set `AUTO_START_LLAMA=true` if the model runs on the same machine
- **Remote**: Set `LLAMA_SERVER_HOST` to the inference server's address
- **On-demand**: When enabled, the chatbot auto-starts/stops llama.cpp based on activity (configurable idle timeout)
