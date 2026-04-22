# Thailand Air Quality Intelligence Lite

Frontend-only **Next.js + TypeScript + Tailwind** dashboard that monitors and predicts PM2.5 for **all 77 provinces of Thailand** using free/public APIs.

## Features

- 77-province metadata dataset (`province_name_th`, `province_name_en`, `region`, `latitude`, `longitude`, `population`, `nearby_stations`).
- Multi-source API engine with fallback priority:
  1. Air4Thai (soft optional)
  2. OpenAQ
  3. Open-Meteo Air Quality
  4. Local fallback baseline
- Weather integration via Open-Meteo (temperature, humidity, wind, rain).
- Hotspot integration via NASA FIRMS (with graceful fallback estimate).
- Local historical storage (90-day rolling) via `localStorage`.
- Browser-side PM2.5 prediction models:
  - Moving Average (7-day)
  - Linear Regression trendline
  - Weighted Smart Score
- Risk scoring engine and alert logic.
- Thesis pages:
  - National dashboard
  - Province detail
  - Compare 2-5 provinces
  - Analytics (MAE/RMSE + reliability)

## Tech Stack

- Next.js App Router
- React + TypeScript strict mode
- Tailwind CSS
- Recharts

## Local Run

```bash
npm install
npm run dev
```

## App Structure

- `app/` pages (dashboard, map, province detail, compare, analytics)
- `components/` charts and reusable UI
- `lib/apis/` free API connectors
- `lib/prediction/` prediction models
- `lib/thailand-provinces.ts` full 77-province dataset
- `lib/cache.ts` local snapshot + historical cache
- `lib/scoring.ts` risk and AQI scoring

## Deployment

Ready for Vercel deployment as a frontend-only app.
