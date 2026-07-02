-- ─────────────────────────────────────────────────────────────
-- Security hardening (Supabase advisor findings, 2026-07-02)
--
-- 1) All fn_* pipeline functions are SECURITY DEFINER and were
--    executable by `anon`/`authenticated` via PostgREST
--    (/rest/v1/rpc/*). With the public anon key anyone could:
--      • fn_upsert_forecast_daily / fn_upsert_model_registry
--        → poison forecasts and the model registry (writes bypass
--          the read-only RLS because of SECURITY DEFINER)
--      • fn_cleanup_old_data → force data deletion
--      • fn_daily_pipeline / fn_sync_* → trigger heavy jobs (DoS)
--    Only pg_cron (runs as the function owner) and the Vercel
--    server (service_role key) are legitimate callers, so EXECUTE
--    is revoked from PUBLIC/anon/authenticated and granted to
--    service_role only.
--
-- 2) air_quality_latest / weather_latest were SECURITY DEFINER
--    views (advisor level ERROR). The underlying hourly tables
--    already allow anon SELECT via RLS, so flipping them to
--    security_invoker preserves behaviour while enforcing the
--    querying user's RLS.
-- ─────────────────────────────────────────────────────────────

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.fn_build_daily_summary(date)',
    'public.fn_cleanup_old_data()',
    'public.fn_daily_pipeline()',
    'public.fn_generate_forecast(integer)',
    'public.fn_refresh_next_runs()',
    'public.fn_sync_air_weather(integer)',
    'public.fn_sync_hotspots(integer)',
    'public.fn_trigger_edge_sync()',
    'public.fn_upsert_forecast_daily(jsonb)',
    'public.fn_upsert_model_registry(jsonb)'
  ]
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;

alter view public.air_quality_latest set (security_invoker = true);
alter view public.weather_latest set (security_invoker = true);
