# Calamity Tracker — Complete REST & Realtime API Reference

Base URL: `http://localhost:8000` (or your configured production domain)

---

## 1. System Health & Readiness

### `GET /api/health`
Process liveness check.
- **Response `200 OK`**:
```json
{
  "status": "ok",
  "uptime": 142.5
}
```

### `GET /api/ready`
Deep readiness probe evaluating MongoDB connection and Redis ping.
- **Response `200 OK` (Healthy)**:
```json
{
  "status": "ready",
  "dependencies": {
    "mongodb": "up",
    "redis": "up"
  }
}
```
- **Response `503 Service Unavailable`**: Returned if MongoDB or Redis is disconnected.

---

## 2. Incidents & Map Feed

### `GET /api/incidents`
Returns cached, map-ready disaster incidents.

- **Headers Exposed**:
  - `X-Cache`: `HIT` or `MISS` (indicates Redis incident cache status)
  - `X-Response-Time`: e.g. `2ms`
- **Query Parameters**:
  - `status` (string): Comma-separated list (`candidate,active,resolved,rejected`). Default: `candidate,active`.
  - `limit` (number): 1–200. Default: `100`.
- **Response `200 OK`**:
```json
{
  "data": [
    {
      "id": "6741b2a9f19a0a1a8c3d4e5f",
      "type": "flood",
      "status": "candidate",
      "severity": "high",
      "locationName": "Patna, Bihar, India",
      "locationPrecision": "city",
      "location": {
        "type": "Point",
        "coordinates": [85.1376, 25.5941]
      },
      "occurredAt": "2026-09-18T10:00:00.000Z",
      "summary": "Severe monsoon flooding submerges low-lying urban areas.",
      "confidenceScore": 0.88,
      "evidenceCount": 2,
      "communityReportCount": 3,
      "sources": [
        {
          "title": "Flooding intensifies across Bihar",
          "canonicalUrl": "https://example.com/news/bihar-flood",
          "source": "newsdata",
          "publishedAt": "2026-09-18T09:30:00.000Z"
        }
      ]
    }
  ],
  "meta": {
    "count": 1,
    "statuses": ["active", "candidate"]
  }
}
```

### `GET /api/events/incidents`
Server-Sent Events (SSE) stream for real-time map updates.
- **Headers**:
  - `Content-Type`: `text/event-stream`
  - `Cache-Control`: `no-cache`
  - `Connection`: `keep-alive`
- **Events Emitted**:
  - `connected`: `{ "ok": true }`
  - `incident.created`: `{ "incidentId": "...", "type": "flood" }`
  - `incident.updated`: `{ "incidentId": "..." }`
  - `report.corroborating`: `{ "reportId": "...", "confirmationsNeeded": 2 }`
  - `report.corroborated`: `{ "reportId": "...", "corroborationCount": 2 }`
  - `: heartbeat`: periodic 25-second keepalive comment.

---

## 3. Citizen Community Signals & Corroboration

### `POST /api/reports`
Submit an unverified citizen observation.
- **Headers**:
  - `Content-Type: application/json`
  - `X-Reporter-Key` (optional, string): Persistent client UUID used for rate limiting, deduplication, and citizen report grouping.
- **Request Body**:
```json
{
  "clientReportId": "c4b9687e-9761-4df2-9b2f-7c18251e6043",
  "type": "wildfire",
  "severity": "critical",
  "description": "Dense smoke rising behind the ridge; trees catching fire rapidly.",
  "location": {
    "coordinates": [-120.1234, 38.5678]
  },
  "locationAccuracyMeters": 15,
  "occurredAt": "2026-09-18T14:20:00.000Z"
}
```
- **Responses**:
  - `201 Created`:
    ```json
    {
      "reportId": "6741c9b0e1234a567890abcd",
      "status": "corroborating",
      "idempotent": false,
      "incidentId": null,
      "confirmationsNeeded": 2,
      "attached": false
    }
    ```
  - `200 OK`: Idempotent replay of an already received `clientReportId`.
  - `400 Bad Request`: Validation failure (e.g. description under 10 chars, out-of-range coordinates).
  - `429 Too Many Requests`: Rate limit exceeded. Returns `Retry-After` header.

### `GET /api/reports`
Public privacy-preserving feed of active community signals. Coordinates are jittered/rounded to ~1.1km to safeguard citizen privacy.
- **Query Parameters**:
  - `type` (optional): Filter by incident type.
  - `limit` (number, default: 50).
- **Response `200 OK`**:
```json
{
  "data": [
    {
      "id": "6741c9b0e1234a567890abcd",
      "type": "wildfire",
      "severity": "critical",
      "description": "Dense smoke rising behind the ridge; trees catching fire rapidly.",
      "occurredAt": "2026-09-18T14:20:00.000Z",
      "status": "corroborating",
      "corroborationCount": 1,
      "confirmationsNeeded": 2,
      "location": {
        "type": "Point",
        "coordinates": [-120.12, 38.57]
      }
    }
  ],
  "meta": { "count": 1 }
}
```

### `GET /api/reports/mine`
Returns reports submitted by the caller's `X-Reporter-Key`.
- **Response `200 OK`**:
```json
{
  "data": [
    {
      "id": "6741c9b0e1234a567890abcd",
      "type": "wildfire",
      "severity": "critical",
      "status": "attached_to_incident",
      "corroborationCount": 3,
      "confirmationsNeeded": 0,
      "incident": {
        "status": "candidate",
        "locationName": "Community Reported WILDFIRE",
        "confidenceScore": 0.85
      }
    }
  ],
  "meta": { "count": 1 }
}
```

### `POST /api/reports/:id/corroborate`
Allows an independent nearby citizen to vouch for an active community signal.
- **Request Body** (optional):
```json
{
  "comment": "Confirmed from main highway.",
  "location": { "coordinates": [-120.1245, 38.5689] }
}
```
- **Response `200 OK`**:
```json
{
  "success": true,
  "promoted": true,
  "incidentId": "6741d8e1f0123456789abcde",
  "corroborationCount": 3
}
```

---

## 4. Observability & Administration

### `GET /api/admin/queues`
Live BullMQ queue metrics across all 4 pipelines.
- **Response `200 OK`**:
```json
{
  "timestamp": "2026-09-18T14:30:00.000Z",
  "status": "online",
  "queues": {
    "news-ingestion": { "waiting": 0, "active": 0, "completed": 12, "failed": 0, "delayed": 1 },
    "ai-processing": { "waiting": 0, "active": 0, "completed": 28, "failed": 0, "delayed": 0 },
    "incident-creation": { "waiting": 0, "active": 0, "completed": 9, "failed": 0, "delayed": 0 },
    "community-processing": { "waiting": 0, "active": 0, "completed": 4, "failed": 0, "delayed": 0 }
  }
}
```

### `POST /api/admin/queues/:name/retry-failed`
Retries all failed jobs in a specific BullMQ queue (`news-ingestion`, `ai-processing`, `incident-creation`, `community-processing`).

### `GET /api/admin/ai/providers`
Health, routing chain, and circuit-breaker status of configured AI providers.
- **Response `200 OK`**:
```json
{
  "routingChain": ["groq-primary", "groq-fallback-1"],
  "providers": {
    "groq-primary": { "available": true, "cooldownTtl": 0, "status": "healthy" },
    "openai": { "available": true, "cooldownTtl": 0, "status": "healthy" },
    "mock": { "available": true, "cooldownTtl": 0, "status": "healthy" }
  }
}
```

### `POST /api/admin/reports/:id/verify`
Moderator action to manually verify a community report and promote it directly to an active incident.

### Manual Pipeline Triggers
- `POST /api/admin/ingest-news`: Manually triggers news provider ingestion.
- `POST /api/admin/process-one-article`: Manually processes one pending raw article through AI routing.
- `POST /api/admin/process-article-batch`: Manually processes a batch of articles up to `AI_BATCH_SIZE`.
- `POST /api/admin/create-incident`: Creates or merges an incident from `{ "extractionId": "..." }`.
