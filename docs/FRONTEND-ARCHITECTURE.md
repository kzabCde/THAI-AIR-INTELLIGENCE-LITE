# Frontend Architecture — Cron-free, Realtime, Hobby-Plan-Ready

This document covers the frontend data/runtime architecture introduced to make
the dashboard **fully independent from Vercel Cron** and driven by **externally
updated Supabase data**, plus the required architecture deliverables.

> Scope note: the live Supabase project currently contains the **20 Isan
> provinces** only. The architecture below is province-scalable; the nationwide
> + district expansion is captured in the Roadmap section (it needs nationwide
> data loaded into Supabase first — no data is fabricated).

---

## 1. Why no Vercel Cron

Vercel Hobby disallows sub-daily cron. So **data ingestion is external** (an
independent worker/edge function/GitHub Action writes to Supabase on whatever
schedule it likes). The frontend never schedules anything — it **reacts** to DB
writes via Supabase Realtime and serves cached reads via ISR + React Query.

The `/api/cron/*` routes and `vercel.json` remain as an **optional** integration
point for any external scheduler (or Vercel Pro), but the UI does not depend on
them.

## 2. Frontend architecture diagram

```
┌──────────────────────────── Browser ────────────────────────────┐
│  Server Components (ISR, revalidate=300)   Client islands         │
│  ─ Overview / Province / Forecast …        ─ Map (MapLibre/Leaflet)│
│        │ initialData (hydrate)             ─ Charts (Recharts)     │
│        ▼                                   ─ LiveProvinceTable      │
│  ┌───────────── AppProviders (client) ─────────────┐              │
│  │  QueryProvider (TanStack)                        │              │
│  │    └─ RealtimeProvider ── Supabase Realtime ◀────┼── WebSocket  │
│  │         └─ OfflineBanner                         │              │
│  └──────────────────────────────────────────────────┘              │
└──────────┬───────────────────────────────────┬───────────────────┘
           │ fetch /api/* (server queries)      │ realtime postgres_changes
           ▼                                     ▼
   Next Route Handlers ─▶ services/* ─▶ Supabase (PostgREST)   Supabase Realtime
                                  ▲                                   │
   External ingestion worker ─────┴───────────── writes rows ────────┘
   (cron-free; any schedule)
```

## 3. Realtime data flow

```
External worker writes air_quality_hourly
        │
        ▼
Postgres logical replication → supabase_realtime publication
        │  (postgres_changes: INSERT/UPDATE)
        ▼
RealtimeProvider channel "isan-air-realtime"
        │  TABLE_INVALIDATIONS[table] → query key prefixes
        ├─▶ queryClient.invalidateQueries({ queryKey: [prefix] })   → client widgets refetch
        └─▶ debounced router.refresh() (1.5s)                        → ISR server components re-render
        │
        ▼
LiveProvinceTable / KPIs update — only changed subtrees re-render
```

Re-render control: realtime callbacks read `autoRefresh` via `useUiStore.getState()`
(not as a dependency) so the channel never re-subscribes; invalidation is keyed,
so only affected queries refetch; `router.refresh()` is debounced to coalesce
bursty writes.

## 4. Component hierarchy

```
RootLayout
├─ <script> theme-init (no-flash)
└─ AppProviders (client boundary)
   ├─ QueryProvider
   ├─ RealtimeProvider
   ├─ OfflineBanner
   ├─ Header ─ LiveStatus (realtime dot + auto-refresh toggle), ThemeToggle, nav
   ├─ main → {page}
   │   ├─ Overview: KPIs · IsanMapCard(dynamic) · AQI distribution · ErrorBoundary>LiveProvinceTable
   │   ├─ Province: hero · metric grid · ForecastCard · HistoryCard (client charts)
   │   ├─ Forecast: KPIs · ForecastChart · daily table  (ProvinceSelect)
   │   ├─ Trends: HistoryCard · CategoryBars (monthly/seasonal)
   │   ├─ Analytics: filters · TrendArea  (ProvinceSelect + RangePresets)
   │   └─ System: freshness · sync jobs · cleanup logs
   └─ MobileNav
```

## 5. State management architecture

| Concern | Tool | Notes |
| --- | --- | --- |
| Server cache / data fetching | **TanStack Query** | SWR, dedupe, retry/backoff, `initialData` hydration from ISR |
| Realtime invalidation | RealtimeProvider + queryClient | maps table → query keys |
| Global UI state | **Zustand** (`stores/ui-store`) | selected province, auto-refresh toggle, realtime status, last event |
| Theme | DOM class + localStorage | no-flash init script |
| URL state | `searchParams` | province/date filters are shareable & SSR-friendly |

React Context is intentionally avoided for data (Query owns it) and limited to
the provider tree. Zustand is used only for cross-component UI flags.

## 6. Data layer — React Query hooks

`hooks/` → `use-overview`, `use-air-quality`, `use-weather`, `use-forecast`,
`use-analytics`. All call typed `/api/*` routes through `lib/query/fetcher.ts`
(envelope-aware). Keys live in `lib/query/keys.ts`. `useHotspots` selects from
the shared overview cache to **avoid a duplicate request**. Defaults:
`staleTime` 60s–5m by domain, 3x retry with capped exponential backoff, refetch
on focus/reconnect.

## 7. Supabase integration strategy

- **Reads**: server-side only, via `services/*` + `/api/*` (anon key never used
  to build queries in the browser). Cached with `unstable_cache`.
- **Realtime**: browser anon client (`lib/supabase/client.ts`) subscribes to the
  `supabase_realtime` publication (enabled via migration for all data tables).
- **Writes**: service-role key, server-only, used by optional `/api/cron/*`.
- **Security**: see `supabase/migrations/0002_rls_readonly_policies.sql` for the
  recommended RLS (enable + anon `SELECT`; writes via service role only).

## 8. Performance optimization checklist

- [x] ISR everywhere (`export const revalidate = 300`); SSG province pages
- [x] Server Components by default; client islands only for interactivity
- [x] Map dynamically imported (`ssr:false`) + lazy-loaded with skeleton
- [x] Charts isolated in client components (Recharts code-split per route)
- [x] React Query dedupe + SWR caching (no redundant DB hits)
- [x] Realtime keyed invalidation → minimal re-renders (no full-page polling)
- [x] Tree-shakeable named imports (lucide-react, date utils)
- [x] Tailwind JIT (only used classes shipped); CSS variables for theming
- [x] Route-level code splitting via App Router; shared JS ≈ 102 kB
- [ ] Swap raster tiles → vector tiles (MapLibre) for the nationwide map
- [ ] `next/image` for any future raster assets

## 9. Recommended folder structure

Current layout (already feature-aligned):

```
app/         routes (server components) + api/ route handlers
components/  ui · charts · map · layout · providers · realtime · overview · province · controls
hooks/       React Query data hooks
services/    server-only data access (per domain) + sync
lib/         isan · aqi · format · supabase(client/server/types) · query(keys/fetcher) · api-response
stores/      Zustand UI store
supabase/    migrations
docs/        architecture docs
```

Optional `src/` consolidation (if desired later): move the above under `src/`
and add `src/features/<domain>` barrels that compose `components + hooks +
services` per feature (e.g. `features/forecast`). Update `tsconfig` paths
(`@/*` → `src/*`). Deferred to avoid churn; the import graph already matches.

## 10. Implementation roadmap

**Phase 1 — Cron-free realtime (done)**
React Query data layer · Supabase Realtime · ISR 300 · error/offline boundaries ·
Zustand UI state · realtime publication enabled.

**Phase 2 — Nationwide data**
Load 77 provinces (+ districts) into Supabase (`provinces`, `districts`, and
district-grained measurement tables). `lib/isan.ts` generalizes to
`lib/regions.ts` with the 6 regions + BMR. Region filter in nav.

**Phase 3 — Map scale (MapLibre GL)**
Replace Leaflet with MapLibre GL; per-region GeoJSON split (North, Northeast,
Central, East, West, South, BMR) lazy-loaded on demand; marker clustering;
choropleth fill-by-AQI; district drill-down on province click; vector tiles.

**Phase 4 — Analytics depth**
Regional comparison, seasonal analysis, pollution-source attribution, and
forecast-accuracy monitoring (compare `forecast_*` vs realized `daily_summary`).

**Phase 5 — Hardening**
Enable RLS read-only policies, add API rate limiting (e.g. token bucket per IP
on `/api/*`), shadcn/ui component adoption, Lighthouse ≥ 90 CI gate.
