-- ─────────────────────────────────────────────────────────────
-- Retire run_data_cleanup() and cleanup_logs.
--
-- run_data_cleanup() used 1-year retention for measurements and
-- 30-day retention for forecasts — both shorter than the pg_cron
-- fn_cleanup_old_data() which uses 18 months / 90 days and also
-- prunes cron_log.  The TS /api/cron/cleanup route now delegates
-- directly to fn_cleanup_old_data(), making run_data_cleanup()
-- dead code.
--
-- cleanup_logs was created in migration 0001 as a per-table audit
-- trail but was never populated by any code path; the actual audit
-- trail goes to cron_log via fn_daily_pipeline / runCleanup().
-- ─────────────────────────────────────────────────────────────

drop function if exists public.run_data_cleanup();

drop table if exists public.cleanup_logs;
