-- ─────────────────────────────────────────────────────────────
-- Fix: sync_state table had a legacy schema (source, last_sync,
-- records_last, run_count) that did not match the codebase types
-- (job_name, status, last_run_at, …).  The mismatch caused a
-- repeated "column sync_state.job_name does not exist" error in
-- Postgres logs every ~8 minutes, which made the Supabase Realtime
-- channel fail with CHANNEL_ERROR and surfaced as intermittent
-- "cannot connect" errors on the overview page.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.sync_state RENAME TO sync_state_legacy;

CREATE TABLE public.sync_state (
  id              bigint generated always as identity primary key,
  job_name        varchar(64)  not null unique,
  source          varchar(64),
  schedule        varchar(64),
  status          varchar(16)  not null default 'idle',
  last_run_at     timestamptz,
  last_success_at timestamptz,
  next_run_at     timestamptz,
  cursor_at       timestamptz,
  records_processed integer    not null default 0,
  duration_ms     integer,
  error_msg       text,
  updated_at      timestamptz  not null default now()
);

ALTER TABLE public.sync_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read sync_state" ON public.sync_state
  FOR SELECT TO anon, authenticated USING (true);

INSERT INTO public.sync_state (job_name, source, schedule, status, last_run_at, last_success_at)
VALUES
  ('pm25_sync',         'openmeteo/air4thai', 'hourly',        'idle', null, null),
  ('weather_sync',      'openmeteo',          'hourly',        'idle', null, null),
  ('hotspot_sync',      'firms',              'every_6_hours', 'idle', null, null),
  ('daily_cleanup',     'internal',           'daily_01_00',   'idle', null, null),
  ('model_retrain',     'internal',           'daily_02_00',   'idle', null, null),
  ('forecast_generate', 'internal',           'after_retrain', 'idle', null, null)
ON CONFLICT (job_name) DO NOTHING;

DROP TABLE public.sync_state_legacy;
