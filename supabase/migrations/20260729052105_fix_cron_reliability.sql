-- Cron reliability hotfix (production version 20260729052105)
--
-- Root causes addressed:
--   1. fn_daily_pipeline() and fn_refresh_next_runs() updated overlapping
--      sync_state rows at minute 30 and could form a circular lock wait.
--   2. fn_refresh_next_runs() refreshed updated_at every ten minutes, making
--      old operational errors look current.
--   3. Disabled jobs were still shown with a future run time.
--
-- Daily next-run timestamps are now maintained by a row-local trigger. The
-- periodic refresher no longer touches the daily pipeline rows, so it cannot
-- deadlock with the pipeline even when either function is invoked manually.

create or replace function public.fn_set_daily_next_run()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_next_run timestamptz;
begin
  if new.job_name in ('daily_cleanup', 'daily_pipeline')
     and new.last_run_at is distinct from old.last_run_at then
    v_next_run := date_trunc('day', now()) + interval '18 hours 30 minutes';
    if v_next_run <= now() then
      v_next_run := v_next_run + interval '1 day';
    end if;
    new.next_run_at := v_next_run;
  end if;

  return new;
end;
$$;

revoke all on function public.fn_set_daily_next_run()
  from public, anon, authenticated;

drop trigger if exists trg_sync_state_daily_next_run
  on public.sync_state;

create trigger trg_sync_state_daily_next_run
before update of last_run_at on public.sync_state
for each row
execute function public.fn_set_daily_next_run();

create or replace function public.fn_refresh_next_runs()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_hourly timestamptz;
  v_six_hour timestamptz;
begin
  v_hourly := date_trunc('hour', v_now) + interval '5 minutes';
  if v_hourly <= v_now then
    v_hourly := v_hourly + interval '1 hour';
  end if;

  v_six_hour := date_trunc('day', v_now)
    + (floor(extract(hour from v_now)::integer / 6) * 6)
      * interval '1 hour'
    + interval '15 minutes';
  if v_six_hour <= v_now then
    v_six_hour := v_six_hour + interval '6 hours';
  end if;

  -- The refresher owns only ingestion rows. Daily pipeline rows are maintained
  -- by trg_sync_state_daily_next_run in the same row update as last_run_at.
  perform 1
  from public.sync_state
  where job_name in ('hotspot_sync', 'pm25_sync', 'weather_sync')
  order by job_name
  for update;

  update public.sync_state
  set next_run_at = case
    when job_name in ('pm25_sync', 'weather_sync') then v_hourly
    when job_name = 'hotspot_sync' then v_six_hour
    else next_run_at
  end
  where job_name in ('hotspot_sync', 'pm25_sync', 'weather_sync')
    and next_run_at is distinct from case
      when job_name in ('pm25_sync', 'weather_sync') then v_hourly
      when job_name = 'hotspot_sync' then v_six_hour
      else next_run_at
    end;
end;
$$;

revoke all on function public.fn_refresh_next_runs()
  from public, anon, authenticated;
grant execute on function public.fn_refresh_next_runs() to service_role;

-- Correct the existing operational rows once. Future daily values are
-- maintained by the trigger without touching updated_at.
update public.sync_state
set next_run_at = case
  when now() < date_trunc('day', now()) + interval '18 hours 30 minutes'
    then date_trunc('day', now()) + interval '18 hours 30 minutes'
  else date_trunc('day', now()) + interval '1 day 18 hours 30 minutes'
end
where job_name in ('daily_cleanup', 'daily_pipeline');

update public.sync_state
set next_run_at = null
where job_name in ('forecast_generate', 'model_retrain')
  and next_run_at is not null;

do $$
declare
  refresh_job_id bigint;
begin
  select jobid
  into refresh_job_id
  from cron.job
  where jobname = 'refresh_next_runs'
  limit 1;

  if refresh_job_id is not null then
    perform cron.alter_job(
      job_id := refresh_job_id,
      schedule := '2,12,22,32,42,52 * * * *'
    );
  end if;
end;
$$;
