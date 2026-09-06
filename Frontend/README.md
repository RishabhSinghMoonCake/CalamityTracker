# Calamity Tracker — Frontend

A React + Vite map client for displaying candidate and active calamity incidents from the Calamity Tracker backend.

## What it displays

The map reads normalized incident data only:

```text
GET /api/incidents
  -> GeoJSON coordinates
  -> map markers and popups
```

It does not call NewsData, Gemini, or the geocoding provider directly. This keeps external API usage controlled by the backend.

## Stack

- React
- Vite
- MapTiler SDK
- Axios
- React Toastify

## Run locally

```powershell
cd Frontend
npm install
npm run dev
```

## Environment variables

Create `Frontend/.env.local` for local development:

```env
VITE_BACKEND_URL=http://localhost:8000
VITE_MAPTILER_API_KEY=replace_me
```

Restart Vite whenever a `VITE_*` value changes.

For a deployed frontend, point `VITE_BACKEND_URL` at the deployed backend only after that backend contains the same `/api/incidents` route.

## Incident contract

The map expects a backend response shaped like:

```json
{
  "data": [
    {
      "id": "...",
      "type": "flood",
      "status": "candidate",
      "severity": "moderate",
      "locationName": "Bihar, India",
      "locationPrecision": "region",
      "location": {
        "type": "Point",
        "coordinates": [85.1376, 25.0961]
      },
      "occurredAt": "2026-08-22T06:36:37.000Z",
      "summary": "...",
      "confidenceScore": 0.9,
      "evidenceCount": 1,
      "sources": []
    }
  ]
}
```

GeoJSON coordinate order is always:

```text
[longitude, latitude]
```

## Marker meaning

| Color | Status | Meaning |
| --- | --- | --- |
| Yellow | `candidate` | A detected event that is still being assessed. |
| Red | `active` | A verified/publicly active incident. |

The popup should expose severity, confidence, location precision, summary, evidence count, and a source link when available.

## Security note

Article titles, summaries, and URLs originate outside the application. Escape text before inserting it into MapTiler's `setHTML()` popup and allow only `http`/`https` source links. This prevents external content from becoming executable markup.

## Future frontend work

- Live incident updates with WebSockets/SSE.
- Filters by disaster type, severity, confidence, and status.
- Cluster markers at low zoom levels.
- Candidate-versus-verified legend and confidence explanation.
- Nearby-incident alert preferences.
- Incident detail panel with evidence timeline and multiple sources.
