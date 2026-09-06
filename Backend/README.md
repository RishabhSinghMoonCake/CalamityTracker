# Calamity Tracker — Backend

An event-driven backend for collecting disaster-related news, classifying it with Gemini, turning usable results into geocoded incident candidates, and serving those incidents to the map.

## What is implemented

```text
NewsData API
  -> RawArticle (deduplicated source evidence)
  -> Gemini AI extraction (auditable classification)
  -> GeocodeCache (cached location lookup)
  -> Incident (GeoJSON map record with evidence links)
  -> GET /api/incidents
```

The pipeline intentionally separates a source article from an incident. Several articles can later support one real-world incident.

## Stack

- Node.js + Express 5
- MongoDB + Mongoose
- Gemini via `@google/genai`
- NewsData API
- Nominatim/OpenStreetMap geocoding
- Redis package installed; response caching and background queues are next

## Run locally

```powershell
cd Backend
npm install
npm run dev
```

The server starts on `PORT` or port `5000` by default.

## Environment variables

Create `Backend/.env` locally. Never commit API keys.

```env
PORT=8000
MONGODB_KEY=mongodb://127.0.0.1:27017/calamitytracker

NEWS_API_URL=https://newsdata.io/api/1/latest
NEWS_API_KEY=replace_me

GEMINI_API_KEY=replace_me
AI_MODEL_NAME=gemini-2.5-flash
AI_PROMPT_VERSION=v2
AI_MAX_ATTEMPTS=3
AI_BATCH_SIZE=3

NOMINATIM_BASE_URL=https://nominatim.openstreetmap.org
GEOCODING_USER_AGENT=CalamityTracker/1.0 (your-email@example.com)

# Reserved for the Redis cache module
REDIS_URL=redis://127.0.0.1:6379
INCIDENTS_CACHE_TTL_SECONDS=60
```

## Data model

### RawArticle

Immutable source evidence from the news provider.

- `canonicalUrl` is unique and prevents duplicate ingestion.
- `rawPayload` preserves the original provider response.
- `status` tracks `pending`, `processing`, `processed`, `skipped`, or `failed`.
- `attempts` and `lastError` support retry diagnostics.

### AiExtraction

The AI's versioned interpretation of one `RawArticle`.

- Captures the model name, prompt version, raw response, parsed result, and confidence.
- Separates AI output from source evidence for auditability.
- Classifies location precision as `city`, `region`, `country`, or `unknown`.

### GeocodeCache

Persistent cache for location lookups.

- Avoids repeatedly calling an external geocoder for the same place.
- Stores resolved, not-found, and failed results.
- Saves GeoJSON coordinates in `[longitude, latitude]` order.

### Incident

The map-facing real-world event.

- GeoJSON `Point` with a `2dsphere` index.
- Status: `candidate`, `active`, `resolved`, or `rejected`.
- Links to source articles and AI extractions as evidence.
- Candidate incidents stay clearly distinct from verified active incidents.

## API

### Health

`GET /api/health`

Returns basic server status and uptime.

### Read incidents

`GET /api/incidents`

Optional query parameters:

- `status`: comma-separated statuses; defaults to `candidate,active`
- `limit`: 1–200; defaults to 100

Example:

```text
GET /api/incidents?status=candidate,active&limit=50
```

The response contains map-ready GeoJSON coordinates, severity, location precision, confidence, source count, and source articles.

### Development administration endpoints

These endpoints are intentionally manual while the ingestion pipeline is being developed. Protect them with admin authentication before deployment.

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/api/admin/ingest-news` | Fetch NewsData results and upsert only unseen raw articles. |
| POST | `/api/admin/process-one-article` | Send one eligible raw article to Gemini. |
| POST | `/api/admin/process-article-batch` | Process a bounded batch based on `AI_BATCH_SIZE`. |
| POST | `/api/admin/create-incident` | Geocode and create/merge one incident from an AI extraction. |

Create an incident with:

```json
{
  "extractionId": "AI_EXTRACTION_OBJECT_ID"
}
```

## Safeguards and measurable outcomes

- Grouped NewsData queries reduced requests per ingestion run from 16 to 3: **81.25% fewer requests**.
- Canonical-URL upserts prevent repeat storage. A tested second run recognized all 29 prior articles and inserted zero duplicates.
- AI processing is bounded through `AI_BATCH_SIZE` and `AI_MAX_ATTEMPTS`.
- News articles, AI output, and map incidents remain separately auditable.
- Geocode results are cached to avoid repeat provider calls.

## Next improvements

- Redis cache for `GET /api/incidents`, with `X-Cache: HIT/MISS` metrics.
- BullMQ workers for ingestion, AI processing, retries, and dead-letter handling.
- Auth and moderator workflows for candidate-to-active verification.
- Community reports with geospatial clustering and confidence scoring.
- WebSockets or SSE for live map updates.
- OpenAPI specification, integration tests, and load-test results.

## Important development notes

- Do not call Gemini or geocoding services from the frontend.
- Do not use `deleteMany()` to refresh incidents; retain evidence and history.
- Never treat an AI classification as verified public information without an explicit status/review policy.
- Coordinates are always `[longitude, latitude]`, not `[latitude, longitude]`.
