# Calamity Tracker — Backend

An event-driven backend for collecting disaster-related news, classifying it with Gemini, turning usable results into geocoded incident candidates, and serving those incidents to the map.

## What is implemented

```text
BullMQ scheduler (Redis)
  -> NewsData API
  -> RawArticle (deduplicated source evidence)
  -> targeted Gemini AI job
  -> AiExtraction (auditable classification)
  -> cached Nominatim geocoding
  -> Incident (GeoJSON map record with evidence links)
  -> Redis cache invalidation
  -> GET /api/incidents
```

The pipeline intentionally separates a source article from an incident. Several articles can later support one real-world incident.

## Stack

- Node.js + Express 5
- MongoDB + Mongoose
- Gemini via `@google/genai`
- NewsData API
- Nominatim/OpenStreetMap geocoding
- Redis: incident-response cache and BullMQ job persistence
- BullMQ + ioredis: scheduled ingestion, targeted AI processing, retries, and incident creation

## Run locally

```powershell
cd Backend
npm install
npm run dev
```

The server starts on `PORT` or port `5000` by default.

Run the worker in a separate terminal when automation is enabled:

```powershell
npm run worker
```

The API server serves HTTP traffic. The worker performs external API calls and background processing. Keep them as separate processes.

## Verify runtime health

```powershell
Invoke-RestMethod http://localhost:8000/api/health
Invoke-RestMethod http://localhost:8000/api/ready
npm run queues:status
```

- `/api/health` confirms the Node process is alive.
- `/api/ready` returns `200` only when MongoDB and Redis are both available.
- `queues:status` prints `waiting`, `active`, `completed`, `failed`, and `delayed` counts for every BullMQ queue.

Expected steady-state behavior:

```text
delayed > 0     scheduled jobs are registered and awaiting their next run
completed grows successful jobs have executed
failed = 0      no jobs currently need investigation
```

Inspect worker-terminal logs for each job's ID, result, and failure reason. After an incident job completes, verify the map feed with `GET /api/incidents`.

## Test and benchmark

Run the automated suite:

```powershell
npm run test
```

The suite uses Node's built-in test runner and covers:

- liveness and readiness endpoint contracts;
- NewsData normalization and URL-based deduplication;
- ingestion upsert operations and reported metrics;
- Gemini response parsing and validation;
- deterministic incident-cache keys; and
- a real Redis ping plus cache-version invalidation primitive.

The Redis integration test uses a unique temporary key and removes it afterward.

Benchmark the cached incident endpoint with the backend running:

```powershell
npm run benchmark:incidents
```

Optional benchmark controls:

```env
BENCHMARK_CONNECTIONS=20
BENCHMARK_DURATION_SECONDS=10
BENCHMARK_URL=http://localhost:8000/api/incidents?status=candidate,active&limit=17
```

Record requests per second, average latency, p99 latency, and non-2xx responses. Run once after warming the Redis cache to measure the cached path.

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

REDIS_URL=redis://127.0.0.1:6379
INCIDENTS_CACHE_TTL_SECONDS=60

# BullMQ scheduling. Keep false until you intentionally allow external API use.
PIPELINE_AUTOMATION_ENABLED=false
NEWS_INGESTION_CRON=0 */6 * * *
AI_PROCESSING_CRON=*/5 * * * *
```

## Automation behavior

When `PIPELINE_AUTOMATION_ENABLED=true` and `npm run worker` is running:

1. BullMQ registers a NewsData job on `NEWS_INGESTION_CRON`.
2. Ingestion stores only unseen articles and enqueues one `ai-processing` job per new article.
3. Each AI job processes exactly its `rawArticleId`; worker concurrency is one.
4. A scheduled AI batch handles previously pending records, capped by `AI_BATCH_SIZE`.
5. A successful, mappable extraction enqueues one incident-creation job.
6. The incident job geocodes, creates or merges the incident, then increments the Redis cache version.

Jobs retry three times with exponential backoff. Completed jobs are retained for one day; failed jobs are retained for seven days.

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
- The incident API has observable Redis `X-Cache: HIT/MISS` headers.
- Local warm-cache benchmark: 5,551 requests/sec, 3.08 ms average latency, 6 ms p99, zero errors, and zero timeouts. Re-run benchmarks after material changes; do not treat this local result as a production SLA.

## Assumptions

- MongoDB and Redis are running before the API server or worker starts.
- NewsData, Gemini, and Nominatim credentials/usage are controlled through environment variables and provider limits.
- Nominatim is appropriate for low-volume development use; use a production geocoding provider or self-hosted service before high-volume deployment.
- AI output is a candidate signal, not verified public truth.
- A report/extraction without trustworthy event geography is not eligible for a map incident.

## Conventions

- Source evidence is immutable: raw provider payloads are retained in `RawArticle`.
- AI output is versioned by `model` and `promptVersion`; it never overwrites source evidence.
- One `Incident` can aggregate multiple article/extraction evidence records.
- Incident state uses `candidate`, `active`, `resolved`, and `rejected`; only a verification policy should promote a candidate to active.
- GeoJSON coordinates are always `[longitude, latitude]`.
- Queue job IDs use hyphens, not colons, to remain BullMQ-safe.
- Workers own external processing; HTTP controllers should stay short and request-focused.

## Next improvements

- Auth and moderator workflows for candidate-to-active verification.
- Community reports with geospatial clustering and confidence scoring.
- WebSockets or SSE for live map updates.
- OpenAPI specification, integration tests, and load-test results.

## Important development notes

- Do not call Gemini or geocoding services from the frontend.
- Do not use `deleteMany()` to refresh incidents; retain evidence and history.
- Never treat an AI classification as verified public information without an explicit status/review policy.
- Coordinates are always `[longitude, latitude]`, not `[latitude, longitude]`.
