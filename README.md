# Calamity Tracker

An event-driven disaster intelligence platform that separates raw news evidence, Multi-AI extraction with automatic failover, community corroboration signals, geospatial clustering, and map-facing incidents. Unverified information never becomes a public map marker by default.

---

## Highlights

- **Multi-AI Routing & Resilience**: Provider-agnostic classification engine with primary Google Gemini (`gemini-2.5-flash`), OpenAI-compatible failover (`gpt-4o-mini`, Groq `llama-3.3-70b`, Ollama), and deterministic fallback with Redis per-provider cooldown circuit breakers.
- **Complete Citizen Community Feature**: Rate-limited, idempotent citizen reporting with privacy preservation (anonymized coordinates), crowd corroboration ("I can confirm this"), and automatic threshold promotion into candidate incidents.
- **Redis Incident Cache & Pub/Sub Realtime Fanout**: Observable `X-Cache: HIT/MISS` headers, sub-millisecond cached responses, and cross-process SSE streaming across workers and API replicas.
- **BullMQ Worker Pipeline**: Dedicated queues for `news-ingestion`, `ai-processing`, `incident-creation`, and `community-processing` with live queue monitoring APIs.
- **Geospatial Correlation & Indexing**: MongoDB GeoJSON `2dsphere` indexes with cluster centroid calculation and L1 Redis / L2 MongoDB geocoding caching.
- **Modern Interactive Web Interface**: Sleek dark glassmorphic UI, dual-layer map markers (incidents vs. community signals), interactive pinpoint placement on map, sliding intelligence drawer, and live SSE updates.

---

## System Architecture

```text
BullMQ Scheduler ──► NewsData API ──► RawArticle (Deduplicated) ──► Multi-AI Router (Gemini / OpenAI / Mock)
                                                                           │
Citizen Report ──► Corroboration Engine (Threshold: 3) ────────────────────┼──► Incident ──► Redis Cache ──► React Map
                                                                           │         │
                                                                 L1 Redis Geocode    └──► Redis Pub/Sub ──► Live SSE
```

- Complete architectural specifications: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Complete REST & SSE API reference: [docs/API.md](docs/API.md)
- Production deployment runbook: [docs/PRODUCTION_DEPLOYMENT.md](docs/PRODUCTION_DEPLOYMENT.md)

---

## Quick Start

### 1. Local Development

Ensure MongoDB and Redis are running locally.

```powershell
# Backend API & Worker
cd Backend
npm install
npm run dev

# Frontend
cd ../Frontend
npm install
npm run dev
```

Run background worker separately when automation is enabled:
```powershell
cd Backend
$env:PIPELINE_AUTOMATION_ENABLED="true"
npm run worker
```

### 2. Turnkey Docker Deployment

Run the complete stack (MongoDB, Redis, API, Worker, and Nginx Frontend) with one command:

```powershell
docker compose up -d --build
```

Access the frontend at `http://localhost:3000` and the API at `http://localhost:8000`.

---

## Verification & Testing

Run the full automated test suite:

```powershell
cd Backend
npm run test
```

Inspect BullMQ queue health and AI provider availability:

```powershell
Invoke-RestMethod http://localhost:8000/api/admin/queues
Invoke-RestMethod http://localhost:8000/api/admin/ai/providers
```

Build the production frontend bundle:

```powershell
cd Frontend
npm run build
```

---

## Safety & Ethics

Calamity Tracker is an awareness and early detection tool, not an emergency dispatch service. Candidate incidents are unconfirmed public signals and do not replace official civic emergency alerts.
