# Production Runbook

For the staged dual-model rollout and non-destructive rollback, follow
[DUAL-MODEL-UPGRADE.md](./DUAL-MODEL-UPGRADE.md). The new workflow is manual
and defaults to dry-run.

## Deploy

1. Deploy application changes from a reviewed pull request.
2. Apply forward-only Supabase migrations in order.
3. Confirm environment variables are present in production: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `ML_SECRET`, and optional `ML_FORECAST_URL`.
4. Verify data freshness and cron status read-only before enabling traffic.
5. Confirm `research_hardening_v4_contract.sql` passes and that any legacy
   classifier without Class 4/5 evidence is inactive.
6. Apply the advisor follow-up after v4; it adds the stations FK index and
   explicit service-role-only RLS policies without granting browser access.
7. Apply the forecast evaluation lifecycle migration. Each ML forecast batch
   then records a `forecast_runs` row, links its forecasts by foreign key and
   evaluates forecasts whose trusted actual daily value has arrived.

The historical production migration inventory is pinned in
`supabase/production-migration-baseline.json`. It reconciles the 65 remote
migration identifiers that predate the repository hardening migration. It is
an audit record, not executable SQL; the numbered repository migrations remain
the bootstrap/squash baseline.

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
- Treat D+2–D+7 rows as experimental. A healthy pipeline does not change that
  model-evidence boundary.

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

Open-Meteo air-quality history is CAMS model-derived data, and historical
weather is reanalysis/model data. Do not describe either source as a ground
monitoring-station observation.

## Dual-model safe workflow

```bash
python training/train_dual_models.py --dry-run --province TH-30
python training/train_dual_models.py --register --province TH-30
# Review run_summary.json, evidence_status, checksums and shadow output.
python training/train_dual_models.py --register --activate --province TH-30
```

Registration uploads immutable native artifacts and always inserts candidates
inactive. Activation is a separate RPC gate. Classifiers cannot activate
without fixed-five-class metrics and at least five final-test samples in both
critical classes. The Colab notebooks default to no registration and no
activation and check out an approved immutable commit.
