# Production Runbook

## Deploy

1. Deploy application changes from a reviewed pull request.
2. Apply forward-only Supabase migrations in order.
3. Confirm environment variables are present in production: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `ML_SECRET`, and optional `ML_FORECAST_URL`.
4. Verify data freshness and cron status read-only before enabling traffic.

## Rollback

1. Roll back the web deployment to the previous Vercel deployment.
2. Disable new cron invocations if the issue is write-path related.
3. Do not reset, drop, truncate, or rotate secrets without explicit approval.
4. For forward-only migrations, apply a reviewed compensating migration rather than editing deployed migrations.

## Cron troubleshooting

- `/api/cron/*` requires `Authorization: Bearer <CRON_SECRET>` in production.
- `/api/ml/forecast` POST requires `Authorization: Bearer <ML_SECRET>` in production.
- Check `sync_state` and `cron_log` with read-only SQL; do not write production data during diagnostics.

## Data freshness

Use Asia/Bangkok for business-day reporting and UTC for stored timestamps. Alert when latest observed PM2.5 or weather rows fall behind the expected hourly cadence.

## Open-Meteo historical backfill

`training/backfill_open_meteo.py` retrieves 365 inclusive days ending yesterday
in Asia/Bangkok for all 20 Isan provinces. It upserts hourly air quality and
weather rows with source `open-meteo`, then calls `fn_build_daily_summary` one
date at a time in chronological order. It does not use `ML_SECRET`.

```bash
pip install -r training/requirements.txt
export SUPABASE_URL="https://<project-ref>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<server-side secret>"

python training/backfill_open_meteo.py --dry-run
python training/backfill_open_meteo.py
```

Use `--start-date YYYY-MM-DD --end-date YYYY-MM-DD` for an explicit inclusive
range. The operation is idempotent because hourly rows are upserted on
`province_id,observed_at,source`. A successful non-dry run also verifies
`training_daily_summary_v2`; it exits with status 2 if any province has fewer
than `--minimum-training-rows` rows (default 180).

### Run from GitHub Actions

After this workflow is merged into the default branch:

1. Add repository or `production` environment secrets named
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
2. Open **Actions → Open-Meteo Historical Backfill → Run workflow**.
3. Run once with mode `dry-run`, `days=365`, and
   `minimum_training_rows=180`.
4. Review the log, then start a second run with mode `backfill`.

The workflow uses a concurrency lock so two backfills cannot run at the same
time. The production job has a 120-minute timeout and does not read
`ML_SECRET`.

Open-Meteo air-quality history is CAMS model-derived data, and historical
weather is reanalysis/model data. Do not describe either source as a ground
monitoring-station observation.
