# Database-only PM2.5 training source of truth

The production training architecture uses a single database source of truth.

- Historical PM2.5/weather request window: `2022-08-01` through `2025-07-18`.
- Open-Meteo CAMS returns the first usable PM2.5 daily data on `2022-08-05`; the four leading unavailable days are preserved as a source gap and are not synthesized or interpolated.
- Persisted historical archive: `training_daily_archive_v1`, `2022-08-05` through `2025-07-18`, exactly `21,580` source-available rows (`1,079 dates × 20 provinces`).
- Request lineage: `training_archive_requests_v1` with endpoint, model, requested period, parameters, response SHA-256, fetch time, notebook version, and lineage version.
- Trusted continuation: `training_daily_summary_v2` from `2025-07-19` onward.
- Unified training read contract: `training_daily_summary_v3`, where trusted continuation rows win on overlap.
- Monthly retraining reads `training_daily_summary_v3` only and makes zero Open-Meteo archive requests.
- Active feature contract remains `daily-pooled-v1`.
- `daily-pooled-v2-fire` is a gated next schema containing `hotspot_count` and `total_frp`; it must not be activated until lineage-complete non-synthetic FIRMS history is available for the training window.

The one-time archive backfill is idempotent. The requested `2022-08-01` boundary remains in request-level lineage, while the data-level contract validates all source-available CAMS days from `2022-08-05` without manufacturing values for the documented source gap.
