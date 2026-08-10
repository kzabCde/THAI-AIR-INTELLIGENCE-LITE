# Production Runbook

For the staged dual-model rollout and non-destructive rollback, follow
[DUAL-MODEL-UPGRADE.md](./DUAL-MODEL-UPGRADE.md). The staged/manual workflow
defaults to dry-run. Production also has a separate fail-closed monthly
champion/challenger retraining workflow described below.

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
`supabase/production-migration-baseline.json`. As of 8 August 2026 it contains
all 76 remote identifiers through
`20260808055645_atomic_dual_pooled_activation`. The forward history represented in this
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
  endpoint after summary/cleanup work. It does not retrain models.
- The monthly champion/challenger workflow runs at 03:30 Asia/Bangkok on the
  second day of each month. A training or comparison failure leaves the current
  active run unchanged.
- Do not re-enable `fn_generate_forecast` as a second writer: unaudited fallback
  rows must not supersede a completed ML batch.
- A forecast is serving-eligible only when it references a `forecast_runs` row
  whose status is `success` or `partial`. Treat rows with no run ID as legacy
  evidence, not as the current forecast.
- Treat D+2–D+7 rows as experimental. A healthy pipeline does not change that
  model-evidence boundary.

## Monthly champion/challenger retraining

`.github/workflows/pm25-monthly-auto-retrain.yml` performs a fresh training run
once per month. It combines a read-only cached Open-Meteo archive beginning
`2022-08-01` with the trusted Supabase continuation, rebuilds leakage-safe daily
features, and preserves the 365-day Validation, 365-day Test and seven-day
embargo boundaries. Historical archive rows are never written to Supabase.

The monthly path is fail closed. Regression must pass the unchanged strict 4.5%
D+1 Skill gate for all 20 provinces; the historical TH-34 conditional exception
is not used for automatic promotion. Classification must pass the reviewed
absolute pooled deployment thresholds, including Accuracy, Macro F1, Balanced
Accuracy, Weighted F1 and Class 4/5 recall/support checks.

After training, the active champion artifacts are evaluated on the exact same
latest 365-day D+1 holdout as the challenger. Both tasks must be non-inferior,
no province-local Regression MAE may regress by more than the policy tolerance,
and at least one task must improve materially. Only then are artifacts uploaded
using the Supabase Free-plan chunk-manifest path and the existing
`fn_activate_pooled_dual_model_run` RPC promotes all 40 rows atomically.
Rejected challengers make no Registry or Storage write and the active Production
run remains unchanged. A seven-day forecast is generated only after a confirmed
promotion.

Manual testing is available from GitHub Actions. `workflow_dispatch` defaults to
`dry_run=true`, which performs archive loading, training and same-holdout
comparison without any Production write. The scheduled monthly invocation is
live but retains the same fail-closed promotion gate.

Monthly challenger windows are operational promotion evidence. They do not
replace the frozen final-test evidence used for the capstone's reported model
result.

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

The canonical Colab entry point is
`training/train_dual_models_pm25.ipynb`. It imports the same
`training.train_pooled_models` functions used above and remains useful for
manual/research training and recovery. The retained
`train_all_6_models_pm25.ipynb` notebook is a legacy comparison/rollback aid;
it is not the scheduled monthly production path.

Registration uploads 20 immutable province-local residual LightGBM artifacts
and one pooled Random Forest runtime. Supabase Free-plan serving keeps oversized
portable runtimes as checksum-verified chunks plus a manifest. Activation is one
atomic dual-task RPC gate. The manual workflow still defaults to dry-run;
`shadow` writes artifacts and summaries without changing the registry.
