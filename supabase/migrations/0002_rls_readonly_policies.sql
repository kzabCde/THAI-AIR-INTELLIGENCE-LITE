-- ─────────────────────────────────────────────────────────────
-- OPTIONAL — Row Level Security hardening (NOT auto-applied).
--
-- ⚠️ SECURITY: All public tables currently have RLS DISABLED, which means the
-- publishable/anon key can read AND write every row. For a public read-only
-- dashboard the recommended posture is:
--   • enable RLS on every table
--   • allow anonymous SELECT (the dashboard only reads)
--   • restrict INSERT/UPDATE/DELETE to the service-role key (used by cron jobs,
--     which bypass RLS automatically)
--
-- Review before running — enabling RLS without the SELECT policies below will
-- block the dashboard entirely.
-- ─────────────────────────────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array[
    'isan_provinces','province_neighbours','air_quality_hourly','weather_hourly',
    'hotspot_daily','daily_summary','forecast_hourly','forecast_daily',
    'sync_state','cleanup_logs','backfill_checkpoints',
    'training_arima','training_tabular','training_lstm'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format(
      'create policy if not exists "public read %1$s" on public.%1$I for select to anon, authenticated using (true);',
      t
    );
  end loop;
end $$;
