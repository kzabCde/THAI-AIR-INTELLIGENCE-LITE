-- ─────────────────────────────────────────────────────────────
-- Isan Air Intelligence — operational pipeline tables
-- Applied to project qtcptorlmteydcslveqm (Central-Thailand-Air-Quality).
--
-- The measurement schema (isan_provinces, air_quality_hourly, weather_hourly,
-- hotspot_daily, daily_summary, forecast_hourly, forecast_daily) and its
-- composite province+datetime indexes already existed. This migration adds the
-- two operational tables required by the data-update workflow.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.sync_state (
  id bigint generated always as identity primary key,
  job_name varchar(64) not null unique,
  source varchar(64),
  schedule varchar(64),
  status varchar(16) not null default 'idle',      -- idle | running | success | error
  last_run_at timestamptz,
  last_success_at timestamptz,
  next_run_at timestamptz,
  cursor_at timestamptz,                            -- high-water mark for incremental syncs
  records_processed integer not null default 0,
  duration_ms integer,
  error_msg text,
  updated_at timestamptz not null default now()
);

create table if not exists public.cleanup_logs (
  id bigint generated always as identity primary key,
  table_name varchar(64) not null,
  cutoff_at timestamptz,
  rows_deleted integer not null default 0,
  status varchar(16) not null default 'success',   -- success | error
  error_msg text,
  duration_ms integer,
  ran_at timestamptz not null default now()
);

create index if not exists idx_cleanup_logs_ran_at on public.cleanup_logs (ran_at desc);
create index if not exists idx_cleanup_logs_table on public.cleanup_logs (table_name, ran_at desc);

-- Seed the known pipeline jobs so the System Status page renders out of the box.
insert into public.sync_state (job_name, source, schedule, status, last_run_at, last_success_at)
values
  ('pm25_sync',        'openmeteo/air4thai', 'hourly',        'success', now(), (select max(observed_at) from public.air_quality_hourly)),
  ('weather_sync',     'openmeteo',          'hourly',        'success', now(), (select max(observed_at) from public.weather_hourly)),
  ('hotspot_sync',     'firms',              'every_6_hours', 'success', now(), (select (max(date) + time '12:00') at time zone 'UTC' from public.hotspot_daily)),
  ('daily_cleanup',    'internal',           'daily_01_00',   'idle',    null, null),
  ('model_retrain',    'internal',           'daily_02_00',   'idle',    null, null),
  ('forecast_generate','internal',           'after_retrain', 'idle',    null, null)
on conflict (job_name) do nothing;

-- Recommended province + datetime composite indexes (idempotent; most already exist).
create index if not exists idx_aqh_province_time on public.air_quality_hourly (province_id, observed_at desc);
create index if not exists idx_wh_province_time  on public.weather_hourly (province_id, observed_at desc);
create index if not exists idx_hd_province_date  on public.hotspot_daily (province_id, date desc);
create index if not exists idx_ds_province_date  on public.daily_summary (province_id, date desc);
create index if not exists idx_fh_province        on public.forecast_hourly (province_id, forecast_at desc);
create index if not exists idx_fd_province        on public.forecast_daily (province_id, forecast_at desc);
