# Calamity Tracker — Production Deployment & Operations Guide

This guide outlines the production deployment, infrastructure architecture, environment configurations, and operational maintenance for Calamity Tracker.

---

## 1. Production Architecture Overview

In production, Calamity Tracker runs as containerized services:

```text
       ┌──────────────────────┐
       │   Nginx Reverse Proxy │
       │  (SSL Termination)   │
       └──────────┬───────────┘
                  │
        ┌─────────┴─────────┐
        │                   │
  [ /api, /events ]     [ / (static) ]
        │                   │
        ▼                   ▼
┌───────────────┐   ┌───────────────┐
│ Express API   │   │ Vite Frontend │
│ (Node.js 22)  │   │ (Nginx HTML)  │
└───────┬───────┘   └───────────────┘
        │
        ├──────────────────────┬──────────────────────┐
        ▼                      ▼                      ▼
┌───────────────┐      ┌───────────────┐      ┌───────────────┐
│  Redis 7.x    │      │ MongoDB 7.x   │      │ BullMQ Worker │
│ Cache/PubSub  │      │ GeoJSON Data  │      │ Background    │
└───────▲───────┘      └───────▲───────┘      └───────┬───────┘
        │                      │                      │
        └──────────────────────┴──────────────────────┘
```

---

## 2. Environment Configuration Reference

Create `.env` based on `.env.example`:

| Key | Description | Default / Recommended |
| --- | --- | --- |
| `PORT` | API listen port | `8000` |
| `MONGODB_KEY` | MongoDB connection URI | `mongodb://mongodb:27017/calamitytracker` |
| `REDIS_URL` | Redis connection URI | `redis://redis:6379` |
| `PIPELINE_AUTOMATION_ENABLED` | Enables BullMQ cron ingestion | `true` (in production) |
| `NEWS_INGESTION_CRON` | NewsData ingestion schedule | `0 */6 * * *` (every 6 hours) |
| `AI_PROCESSING_CRON` | Batch AI processing schedule | `*/5 * * * *` (every 5 minutes) |
| `AI_PRIMARY_PROVIDER` | Primary AI classifier | `groq-primary` |
| `AI_FALLBACK_PROVIDERS` | Comma-separated fallback chain | `groq-fallback-1` |
| `GROQ_API_KEY` | Primary Groq API credential | Required |
| `GROQ_API_KEY_FALLBACK_1` | Fallback Groq API credential | Required |
| `GROQ_MODEL` | Groq classifier model | `openai/gpt-oss-20b` |
| `ADMIN_API_KEY` | Required secret for `/api/admin/*` | Required |
| `CORS_ALLOWED_ORIGINS` | Comma-separated allowed web origins | Required |
| `COMMUNITY_CONFIRMATION_THRESHOLD` | Reports required to promote | `3` |
| `COMMUNITY_CLUSTER_RADIUS_METERS` | Proximity clustering radius | `5000` (meters) |
| `INCIDENTS_CACHE_TTL_SECONDS` | Redis cache TTL for incident feed | `60` |

---

## 3. Docker Compose Deployment

A turnkey `docker-compose.yml` is provided in the repository root.

### 3.1 Start All Services

```bash
docker compose up -d --build
```

This boots:
1. `mongodb`: Persistent storage in volume `mongo_data` with GeoJSON indexes.
2. `redis`: In-memory caching and BullMQ queues in volume `redis_data`.
3. `api`: Express API serving `/api` and `/api/events/incidents`.
4. `worker`: Background worker processing scheduled ingestion, AI routing, and geocoding.
5. `frontend`: Production React client served via Nginx.

### 3.2 Verify Cluster Health

```bash
# Verify API process liveness
docker compose exec api node -e "fetch('http://localhost:8000/api/health').then(r=>r.text()).then(console.log)"

# Verify Database and Redis readiness
curl http://localhost:8000/api/ready

# Inspect BullMQ queue metrics
curl http://localhost:8000/api/admin/queues

# Inspect AI providers circuit breaker status
curl http://localhost:8000/api/admin/ai/providers
```

---

## 4. Operational Runbook

### 4.1 Retrying Failed Jobs
If upstream providers suffered an extended outage and jobs landed in BullMQ failed state:
```bash
curl -X POST http://localhost:8000/api/admin/queues/ai-processing/retry-failed
curl -X POST http://localhost:8000/api/admin/queues/news-ingestion/retry-failed
```

### 4.2 Flushing the Incident Cache
The incident cache automatically invalidates on any create/update via atomic version increment. To manually force a refresh:
```bash
docker compose exec redis redis-cli INCR incidents:cache-version
```

### 4.3 Inspecting Worker Logs
```bash
docker compose logs -f worker
```

---

## 5. Security & Safety Best Practices

1. **Protect Admin Routes**:
   Ensure `/api/admin/*` endpoints are protected by API keys, basic auth, or restricted to internal VPN networks before public exposure.
2. **Reverse Proxy Rate Limiting**:
   Deploy Cloudflare or an Nginx rate limit in front of `POST /api/reports` to protect against distributed volumetric attacks.
3. **Citizen Data Privacy**:
   Never remove the `anonymizeCoordinates` transform from public endpoints. Exact citizen locations must remain encrypted/hashed on backend storage.
