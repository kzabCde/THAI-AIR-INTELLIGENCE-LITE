# Architecture — Isan Air Intelligence

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
| `forecast_daily` | daily | PM2.5 forecast (7-day) |
| `sync_state` | — | pipeline job status / cursors |
| `cleanup_logs` | — | retention-cleanup audit trail |

Supporting tables retained for the ML pipeline: `province_neighbours`,
`training_arima`, `training_tabular`, `training_lstm`, `backfill_checkpoints`.

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

`buildForecast()` is a deterministic EWMA + damped-trend model with a diurnal
PM2.5 curve. It produces a 168-hour hourly series and a 7-day daily series with
horizon-decaying confidence. The read path (`getProvinceForecast`) serves stored
rows from `forecast_*` when present, otherwise computes on the fly. The
`/api/cron/retrain` job regenerates and upserts forecasts for all provinces.

## Caching strategy

- Server queries wrapped in `unstable_cache` (60–3600s by domain).
- API routes set `Cache-Control: s-maxage / stale-while-revalidate`.
- Pages use ISR `revalidate`; province pages are SSG via `generateStaticParams`.
- The Leaflet map is dynamically imported (`ssr: false`) and lazy-loaded.

## Security note

All tables currently have RLS disabled. See
`supabase/migrations/0002_rls_readonly_policies.sql` for the recommended
read-only hardening (enable RLS + anon `SELECT`; writes via service role).
