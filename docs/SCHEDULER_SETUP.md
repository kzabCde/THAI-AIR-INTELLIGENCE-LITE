# Scheduler Setup

This project targets the **Vercel Hobby Plan**, which does not support Vercel Cron Jobs.
All scheduled data ingestion must be triggered by an **external scheduler**.

## Endpoints

Each endpoint accepts `POST` requests with a `Bearer` token:

| Endpoint | Job | Suggested Interval |
|---|---|---|
| `POST /api/ingest/air-quality` | PM2.5 hourly sync | Every 1 hour |
| `POST /api/ingest/weather` | Weather hourly sync | Every 1 hour |
| `POST /api/ingest/hotspots` | Hotspot daily sync | Every 6 hours |
| `POST /api/ingest/forecast` | Forecast regeneration | Every 6 hours |

The legacy route `POST /api/cron/<job>` (jobs: `pm25-sync`, `weather-sync`, `hotspot-sync`, `cleanup`, `retrain`) also works and uses the same `CRON_SECRET` variable.

## Environment Variables

```
INGEST_SECRET=<random-secret>   # Used by /api/ingest/* routes
CRON_SECRET=<random-secret>     # Used by /api/cron/* routes (can be the same value)
```

Generate a secret:
```bash
openssl rand -hex 32
```

---

## Option 1: GitHub Actions

Create `.github/workflows/scheduler.yml`:

```yaml
name: Data Ingestion
on:
  schedule:
    - cron: '0 * * * *'   # every hour (UTC)
  workflow_dispatch:

jobs:
  ingest:
    runs-on: ubuntu-latest
    steps:
      - name: Sync Air Quality
        run: |
          curl -sf -X POST ${{ secrets.APP_URL }}/api/ingest/air-quality \
            -H "Authorization: Bearer ${{ secrets.INGEST_SECRET }}"

      - name: Sync Weather
        run: |
          curl -sf -X POST ${{ secrets.APP_URL }}/api/ingest/weather \
            -H "Authorization: Bearer ${{ secrets.INGEST_SECRET }}"

  ingest-heavy:
    runs-on: ubuntu-latest
    if: ${{ github.event.schedule == '0 */6 * * *' || github.event_name == 'workflow_dispatch' }}
    steps:
      - name: Sync Hotspots
        run: |
          curl -sf -X POST ${{ secrets.APP_URL }}/api/ingest/hotspots \
            -H "Authorization: Bearer ${{ secrets.INGEST_SECRET }}"

      - name: Regenerate Forecasts
        run: |
          curl -sf -X POST ${{ secrets.APP_URL }}/api/ingest/forecast \
            -H "Authorization: Bearer ${{ secrets.INGEST_SECRET }}"
```

**GitHub Secrets required:** `APP_URL`, `INGEST_SECRET`

---

## Option 2: Railway Cron Service

In your Railway project, add a **Cron Service** with the following commands:

```bash
# Every hour — air quality + weather
curl -sf -X POST $APP_URL/api/ingest/air-quality \
  -H "Authorization: Bearer $INGEST_SECRET"
curl -sf -X POST $APP_URL/api/ingest/weather \
  -H "Authorization: Bearer $INGEST_SECRET"
```

```bash
# Every 6 hours — hotspots + forecast
curl -sf -X POST $APP_URL/api/ingest/hotspots \
  -H "Authorization: Bearer $INGEST_SECRET"
curl -sf -X POST $APP_URL/api/ingest/forecast \
  -H "Authorization: Bearer $INGEST_SECRET"
```

**Railway Variables required:** `APP_URL`, `INGEST_SECRET`

---

## Option 3: Supabase Edge Function + pg_cron

Create a Supabase Edge Function `trigger-ingest/index.ts`:

```typescript
Deno.serve(async () => {
  const APP_URL = Deno.env.get("APP_URL")!;
  const INGEST_SECRET = Deno.env.get("INGEST_SECRET")!;

  const endpoints = [
    "/api/ingest/air-quality",
    "/api/ingest/weather",
    "/api/ingest/hotspots",
    "/api/ingest/forecast",
  ];

  const results = await Promise.allSettled(
    endpoints.map((path) =>
      fetch(`${APP_URL}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${INGEST_SECRET}` },
      })
    )
  );

  return Response.json({ triggered: results.length });
});
```

Then schedule it with `pg_cron` in the Supabase SQL editor:

```sql
select cron.schedule(
  'trigger-ingest-hourly',
  '0 * * * *',
  $$
    select net.http_post(
      url := 'https://<project-ref>.supabase.co/functions/v1/trigger-ingest',
      headers := '{"Authorization": "Bearer <supabase-anon-key>"}'::jsonb
    );
  $$
);
```

---

## Testing Manually

```bash
export APP_URL=https://your-app.vercel.app
export INGEST_SECRET=your-secret

# Trigger each job
curl -sf -X POST $APP_URL/api/ingest/air-quality \
  -H "Authorization: Bearer $INGEST_SECRET" | jq

curl -sf -X POST $APP_URL/api/ingest/weather \
  -H "Authorization: Bearer $INGEST_SECRET" | jq

curl -sf -X POST $APP_URL/api/ingest/hotspots \
  -H "Authorization: Bearer $INGEST_SECRET" | jq

curl -sf -X POST $APP_URL/api/ingest/forecast \
  -H "Authorization: Bearer $INGEST_SECRET" | jq
```
