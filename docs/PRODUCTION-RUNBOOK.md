# Production Runbook

For the staged dual-model rollout and non-destructive rollback, follow
[DUAL-MODEL-UPGRADE.md](./DUAL-MODEL-UPGRADE.md). The new workflow is manual
and defaults to dry-run.

## Deploy

1. Deploy application changes from a reviewed pull request.
2. Compare `supabase/production-migration-baseline.json` with the linked
   Supabase project before applying anything. Apply only new forward-only
   migrations whose 14-digit version is absent from Production.
3. Confirm environment variables are present in production: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `ML_SECRET`, and optional `ML_FORECAST_URL`.
4. Verify data freshness and cron status read-only before enabling traffic.
5. Confirm `research_hardening_v4_contract.sql` passes and that any legacy
   classifier without Class 4/5 evidence is inactive.
6. Apply the advisor follow-up after v4; it adds the stations FK index and
   explicit service-role-only RLS policies without granting browser access.
7. Apply the forecast evaluation lifecycle migration. Each ML forecast batch
   then records a `forecast_runs` row, links its forecasts by foreign key and
   evaluates forecasts whose trusted actual daily value has arrived.
8. Apply `20260727003726_align_runtime_with_observed_data.sql` only after the
   matching application release is deployed. It moves technical-status reads
   to the service role, replaces the slow latest-row views, exposes
   service-only trusted analytics views, and disables direct SQL fallback
   forecast generation.
9. Trigger one authenticated `/api/ml/forecast` run after the remediation
   migration. Confirm that all newly written daily forecasts have a completed
   `forecast_run_id`, target D+1 or later in Asia/Bangkok, and use an active
   registry artifact.

The Production migration inventory is pinned in
`supabase/production-migration-baseline.json`. As of 30 July 2026 it contains
all 73 remote identifiers through
`20260730154307_reconcile_runtime_contract_history`. The forward history represented in this
repository starts at `20260718084717`; every SQL file in
`supabase/migrations` must have the same version and name as its Production
record.

The squashed setup SQL is stored in `supabase/bootstrap` and is only for
provisioning an empty database. Superseded candidates that were never recorded
in Production are stored in `supabase/archive`. Neither directory may be
passed to linked migration tooling or copied back into
`supabase/migrations`.

The checked-in `.mcp.json` scopes the Supabase connector to project
`qtcptorlmteydcslveqm` and contains no credential. Application runtime access
continues to use environment variables; never commit their values.

## Rollback

1. Roll back the web deployment to the previous Vercel deployment.
2. Disable new cron invocations if the issue is write-path related.
3. Do not reset, drop, truncate, or rotate secrets without explicit approval.
4. For forward-only migrations, apply a reviewed compensating migration rather than editing deployed migrations.

## Cron troubleshooting

- `/api/cron/*` requires `Authorization: Bearer <CRON_SECRET>` in production.
- `/api/ml/forecast` POST requires `Authorization: Bearer <ML_SECRET>` in production.
- Check `sync_state` and `cron_log` with read-only SQL; do not write production data during diagnostics.
- Scheduled ML/upstream calls retry transient failures three times with capped
  exponential backoff. Unresolved failures are deduplicated in
  `pipeline_alerts`; a successful subsequent run resolves the alert.
- The daily database pipeline runs at 01:30 Asia/Bangkok and triggers the ML
  endpoint after summary/cleanup work. Model retraining is manual. Do not
  re-enable `fn_generate_forecast` as a second writer: unaudited fallback rows
  must not supersede a completed ML batch.
- A forecast is serving-eligible only when it references a `forecast_runs` row
  whose status is `success` or `partial`. Treat rows with no run ID as legacy
  evidence, not as the current forecast.
- Treat D+2–D+7 rows as experimental. A healthy pipeline does not change that
  model-evidence boundary.

## Data freshness

Use Asia/Bangkok for business-day reporting and UTC for stored timestamps.
Alert when latest observed PM2.5 or weather rows fall behind the expected
hourly cadence. Analytics and seasonal reports must read
`trusted_daily_metrics_v1`; hotspot summaries must read
`observed_hotspot_daily_v1`. Both service-only views exclude rows labelled
`synthetic`, `mock`, or `demo`.

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

Open-Meteo air-quality history is CAMS model-derived data, and historical
weather is reanalysis/model data. Do not describe either source as a ground
monitoring-station observation.

## Dual-model safe workflow

```bash
python -m training.train_pooled_models --dry-run
python -m training.train_pooled_models --shadow
python -m training.train_pooled_models --register
# Review run_summary.json, evidence_status, checksums and shadow output.
python -m training.train_pooled_models --register --activate
```

Registration uploads immutable native and exact portable tree artifacts and always inserts candidates
inactive. Activation is a separate RPC gate. Classifiers cannot activate
without fixed-five-class pooled metrics and at least five final-test samples in
both critical classes. The GitHub workflow defaults to dry-run; `shadow` writes
artifacts and summaries without changing the registry.
