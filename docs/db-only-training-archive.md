# Database-only PM2.5 training source of truth

The production training architecture is migrating to a single database source of truth.

- Historical PM2.5/weather archive: `training_daily_archive_v1`, 2022-08-01 through 2025-07-18.
- Request lineage: `training_archive_requests_v1` with endpoint, model, parameters, response SHA-256, fetch time, and lineage version.
- Trusted continuation: `training_daily_summary_v2`.
- Unified training read contract: `training_daily_summary_v3`, where trusted continuation rows win on overlap.
- Monthly retraining reads `training_daily_summary_v3` only and makes zero Open-Meteo archive requests.
- Active feature contract remains `daily-pooled-v1`.
- `daily-pooled-v2-fire` is a gated next schema containing `hotspot_count` and `total_frp`; it must not be activated until lineage-complete non-synthetic FIRMS history is available for the training window.

The one-time archive backfill is idempotent and verifies exactly 21,660 daily rows (1,083 dates × 20 provinces) before the monthly DB-only path can pass its source contract.
