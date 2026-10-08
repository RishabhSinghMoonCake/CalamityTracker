# Calamity Tracker frontend

React + Vite + MapTiler map client.

## Features

- Candidate/active incident markers with confidence, source, and evidence context.
- Server-Sent Event refreshes after incident changes.
- Consent-based geolocation community reporting with privacy-aware copy.

## Run

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

`VITE_BACKEND_URL` must expose `/api/incidents`, `/api/events/incidents`, and `/api/reports`. Build production assets with `npm run build`.
