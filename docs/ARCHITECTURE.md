# Architecture — Isan Air Intelligence

> Regression + classification design: [DUAL-MODEL-UPGRADE.md](./DUAL-MODEL-UPGRADE.md)

## Overview

A server-rendered Next.js dashboard for the 20 Northeastern Thailand (Isan)
provinces, backed entirely by a Supabase PostgreSQL database. There is no mock
data: every page reads live rows through typed, cached server-side queries.

```
Browser ──▶ Next.js App Router (Server Components)
                │  (server-only services, Next Data Cache)
                ▼
            Supabase JS (typed) ──▶ PostgreSQL (province-level tables)
                ▲
Vercel Cron ──▶ /api/cron/* (service-role writes: sync, cleanup, forecasts)
```

## Database schema (province-level only)

Primary key for every measurement table is `province_id` (`TH-30`…`TH-49`,
FK → `isan_provinces`).

| Table | Grain | Purpose |
| --- | --- | --- |
| `isan_provinces` | — | 20 provinces (id, names, lat/lon, area) |
| `air_quality_hourly` | hourly | PM2.5/PM10/AQI per province |
| `weather_hourly` | hourly | temperature, humidity, wind, precip… |
| `hotspot_daily` | daily | FIRMS fire hotspot counts/FRP |
| `daily_summary` | daily | aggregated + feature-engineered daily stats |
| `forecast_hourly` | hourly | PM2.5 forecast (≤168h horizon) |
| `forecast_daily` | daily | D+1 assessed forecast plus experimental D+2–D+7 rows |
| `sync_state` | — | pipeline job status / cursors |
| `cleanup_logs` | — | retention-cleanup audit trail |

Supporting ML/operations tables include `model_registry`, `model_artifacts`,
`stations`, `station_observations`, `feature_snapshots`, `forecast_runs`,
`forecast_evaluations`, `model_drift_metrics`, `region_membership`,
`pipeline_alerts`, `province_neighbours` and `backfill_checkpoints`.

### Indexes

Composite `(province_id, <time> DESC)` indexes back every read pattern:
`idx_aqh_province_time`, `idx_wh_province_time`, `idx_hd_province_date`,
`idx_ds_province_date`, plus `(<time> DESC)` indexes for region-wide latest
queries.

## Layers

- **`lib/`** — pure, framework-free domain logic. `isan.ts` is the single source
  of truth for province metadata; `aqi.ts` owns PM2.5→AQI conversion and the
  color/category system; `supabase/` holds the client factory + generated types.
- **`services/*.service.ts`** — `server-only` data access. Each domain
  (PM2.5, weather, hotspot, forecast, daily-summary) exposes typed query
  functions. `overview`, `analytics`, and `system` compose them. All reads run
  through `cachedQuery` (Next `unstable_cache`) to avoid redundant DB hits.
- **`app/api/*`** — thin REST handlers with validation + uniform error envelopes.
- **`app/*`** — server components that fetch via services and render. Client
  islands (`"use client"`) are limited to interactive bits: map, charts,
  selectors, theme toggle, sortable table.

## Forecasting

The Python ML endpoint evaluates the active lightweight serving artifact from
`model_registry` and writes daily forecasts. Training compares six teacher
families but reports the deployed Ridge/Logistic family separately. D+1 uses
the validated next-day contract; recursive D+2–D+7 rows are explicitly
experimental. Each row records provenance/fallback status and P10/P50/P90
uncertainty where calibrated residuals exist.

## Caching strategy

- Server queries wrapped in `unstable_cache` (60–3600s by domain).
- API routes set `Cache-Control: s-maxage / stale-while-revalidate`.
- Pages use ISR `revalidate`; province pages are SSG via `generateStaticParams`.
- The Leaflet map is dynamically imported (`ssr: false`) and lazy-loaded.

## Security note

Production tables use RLS and browser roles are read-only where public access is
required. Sensitive training, artifact, evaluation, drift and alert tables are
service-role only. Write RPCs revoke public/anon/authenticated execution.
