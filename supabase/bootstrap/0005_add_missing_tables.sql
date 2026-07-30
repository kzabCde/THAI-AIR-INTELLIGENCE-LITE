-- ─────────────────────────────────────────────────────────────
-- Add cron_log and model_registry to version control.
-- Both tables exist in the live DB but were omitted from earlier
-- migrations; this file makes the schema self-contained.
-- ─────────────────────────────────────────────────────────────

-- Unified job audit trail written by both pg_cron (fn_daily_pipeline,
-- fn_cleanup_old_data) and the TS /api/cron/* routes.
create table if not exists public.cron_log (
  id          bigint generated always as identity primary key,
  job_name    varchar(64)  not null,
  started_at  timestamptz  not null default now(),
  finished_at timestamptz,
  status      varchar(16)  not null default 'success',
  duration_ms integer,
  records_in  integer,
  records_out integer,
  error_msg   text,
  meta        jsonb
);

create index if not exists idx_cron_log_started on public.cron_log (started_at desc);
create index if not exists idx_cron_log_job     on public.cron_log (job_name, started_at desc);

-- One row per (model_name, province_id) tracking forecast model versions
-- and their backtest performance metrics.
create table if not exists public.model_registry (
  id            bigint generated always as identity primary key,
  model_name    varchar(64) not null,
  province_id   varchar(16),
  trained_at    timestamptz not null,
  training_rows integer,
  mae           numeric,
  rmse          numeric,
  r2            numeric,
  is_active     boolean default true,
  model_params  jsonb,
  created_at    timestamptz default now(),
  unique (model_name, province_id)
);

create index if not exists idx_model_registry_active
  on public.model_registry (model_name) where is_active;

-- RLS: system status page reads both tables with the anon key.
alter table public.cron_log       enable row level security;
alter table public.model_registry enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='cron_log' and policyname='public read cron_log'
  ) then
    create policy "public read cron_log"
      on public.cron_log for select to anon, authenticated using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='model_registry' and policyname='public read model_registry'
  ) then
    create policy "public read model_registry"
      on public.model_registry for select to anon, authenticated using (true);
  end if;
end $$;
