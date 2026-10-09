# Calamity Tracker ⚡

A real-time, AI-powered disaster and crisis intelligence platform. Calamity Tracker automatically ingests global news, uses LLMs to extract critical incident data, and visually maps active emergencies around the world. It also supports decentralized citizen corroboration for ground-truth reporting.

## Architecture

Calamity Tracker is built as a highly robust, multi-container microservice architecture:
- **Frontend**: A modern React SPA using Vite, MapTiler SDK for Survey of India-compliant geopolitical mapping, and glassmorphic UI aesthetics. Served efficiently via Nginx.
- **API Server**: An Express.js backend handling REST endpoints, Server-Sent Events (SSE) for real-time map updates, and citizen report submissions.
- **Worker Pipeline**: A resilient BullMQ-powered background job processing system. It continuously ingests news from NewsData.io and passes it through an AI pipeline (using Groq Llama/Qwen models) to classify, extract, and deduplicate disasters.
- **Database Layer**: MongoDB (primary persistence for incidents, reports, and raw articles) and Redis (pub/sub, BullMQ job state, and caching).

## Features

- **Real-Time Feed**: Server-Sent Events instantly push new disaster intelligence to connected clients.
- **AI Deduplication & Extraction**: Automatically strips noise from news and extracts precise geospatial coordinates, severity, and confidence scores.
- **Citizen Signals**: Users can report local calamities. Reports remain hidden as "Citizen Signals" until they receive corroboration from at least 3 nearby observers, at which point they are upgraded to verified incidents.
- **Self-Cleaning DB**: Native MongoDB Time-To-Live (TTL) indexes automatically purge stale news and resolved disasters after 3 days.

## How to Build and Run Locally

### Prerequisites
- Docker & Docker Compose
- MapTiler API Key (for maps)
- Groq API Key (for LLM inference)
- NewsData API Key (for global news ingestion)

### 1. Environment Configuration
Clone the repository and create two `.env` files.

**Backend (`Backend/.env`)**:
```env
PORT=8000
MONGODB_URI=mongodb://mongodb:27017/calamity
REDIS_URL=redis://redis:6379
NEWSDATA_API_KEY=your_newsdata_key_here
GROQ_API_KEY=your_groq_key_here
GROQ_MODEL=qwen/qwen3.8-27b
CORS_ALLOWED_ORIGINS=http://localhost:3000
```

**Frontend (`Frontend/.env`)**:
```env
# Leave VITE_BACKEND_URL empty so the Nginx proxy handles routing
VITE_BACKEND_URL=""
VITE_MAPTILER_API_KEY=your_maptiler_key_here
```

### 2. Launch the Platform
From the root directory, simply run:
```bash
docker compose up -d --build
```
This will automatically spin up:
- MongoDB (Port 27018 mapped to host)
- Redis
- API Server
- Background Worker
- Frontend Nginx Proxy (Port 3000)

### 3. Access
Open your browser and navigate to `http://localhost:3000`.

## License
Open Source. Fork, modify, and deploy to build better crisis response systems!
