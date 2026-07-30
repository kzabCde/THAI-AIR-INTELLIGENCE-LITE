set lock_timeout = '5s';
set statement_timeout = '90s';

-- Production audit remediation
-- - serves only auditable forecast runs and stops scheduled fallback overwrite
-- - exposes trusted observed-only daily/hotspot read models to server code
-- - makes latest-observation views use selective partial indexes
-- - records feature/drift observability and tightens technical-table grants

create index if not exists idx_aqh_trusted_latest
  on public.air_quality_hourly (province_id, observed_at desc)
  where lower(source) not in ('synthetic', 'mock', 'demo');

create index if not exists idx_wh_trusted_latest
  on public.weather_hourly (province_id, observed_at desc)
  where lower(source) not in ('synthetic', 'mock', 'demo');

create index if not exists idx_hd_trusted_province_date
  on public.hotspot_daily (province_id, date desc)
  where lower(source) not in ('synthetic', 'mock', 'demo');

create index if not exists idx_fd_run_province_target
  on public.forecast_daily (forecast_run_id, province_id, target_date)
  where forecast_run_id is not null;

create or replace view public.air_quality_latest
with (security_invoker = true)
as
select latest.*
from public.isan_provinces as province
cross join lateral (
  select
    air.id,
    air.province_id,
    air.observed_at,
    air.pm25,
    air.pm10,
    air.aqi,
    air.aqi_category,
    air.source,
    air.station_id,
    air.created_at
  from public.air_quality_hourly as air
  where air.province_id = province.province_id
    and air.observed_at <= date_trunc('hour', now())
    and lower(air.source) not in ('synthetic', 'mock', 'demo')
  order by air.observed_at desc
  limit 1
) as latest;

create or replace view public.weather_latest
with (security_invoker = true)
as
select latest.*
from public.isan_provinces as province
cross join lateral (
  select
    weather.id,
    weather.province_id,
    weather.observed_at,
    weather.temperature,
    weather.humidity,
    weather.wind_speed,
    weather.wind_direction,
    weather.precipitation,
    weather.pressure,
    weather.cloud_cover,
    weather.visibility,
    weather.source,
    weather.created_at
  from public.weather_hourly as weather
  where weather.province_id = province.province_id
    and weather.observed_at <= date_trunc('hour', now())
    and lower(weather.source) not in ('synthetic', 'mock', 'demo')
  order by weather.observed_at desc
  limit 1
) as latest;

grant select on public.air_quality_latest to anon, authenticated;
grant select on public.weather_latest to anon, authenticated;

create or replace view public.observed_hotspot_daily_v1
with (security_invoker = true)
as
select
  hotspot.id,
  hotspot.province_id,
  hotspot.date,
  hotspot.hotspot_count,
  hotspot.total_frp,
  hotspot.max_frp,
  hotspot.high_confidence_count,
  hotspot.source,
  hotspot.created_at
from public.hotspot_daily as hotspot
where lower(hotspot.source) not in ('synthetic', 'mock', 'demo');

revoke all on public.observed_hotspot_daily_v1
  from public, anon, authenticated;
grant select on public.observed_hotspot_daily_v1 to service_role;

create or replace view public.trusted_daily_metrics_v1
with (security_invoker = true)
as
with trusted_air as (
  select
    air.province_id,
    (air.observed_at at time zone 'Asia/Bangkok')::date as date,
    avg(air.pm25)::numeric as pm25_mean,
    max(air.pm25)::numeric as pm25_max,
    min(air.pm25)::numeric as pm25_min,
    avg(air.pm10)::numeric as pm10_mean,
    avg(air.aqi)::numeric as aqi_mean,
    count(distinct date_trunc(
      'hour',
      air.observed_at at time zone 'Asia/Bangkok'
    ))::integer as hours_available,
    array_agg(distinct air.source order by air.source) as trusted_sources,
    max(air.observed_at) as trusted_observed_at
  from public.air_quality_hourly as air
  where air.pm25 is not null
    and air.observed_at <= date_trunc('hour', now())
    and lower(air.source) not in ('synthetic', 'mock', 'demo')
  group by
    air.province_id,
    (air.observed_at at time zone 'Asia/Bangkok')::date
  having count(distinct date_trunc(
    'hour',
    air.observed_at at time zone 'Asia/Bangkok'
  )) >= 18
),
trusted_weather as (
  select
    weather.province_id,
    (weather.observed_at at time zone 'Asia/Bangkok')::date as date,
    avg(weather.temperature)::numeric as temp_mean,
    max(weather.temperature)::numeric as temp_max,
    min(weather.temperature)::numeric as temp_min,
    avg(weather.humidity)::numeric as humidity_mean,
    avg(weather.wind_speed)::numeric as wind_speed_mean,
    max(weather.wind_speed)::numeric as wind_speed_max,
    avg(weather.wind_direction)::numeric as wind_dir_mean
  from public.weather_hourly as weather
  where weather.observed_at <= date_trunc('hour', now())
    and lower(weather.source) not in ('synthetic', 'mock', 'demo')
  group by
    weather.province_id,
    (weather.observed_at at time zone 'Asia/Bangkok')::date
),
trusted_hotspot as (
  select
    hotspot.province_id,
    hotspot.date,
    sum(hotspot.hotspot_count)::integer as hotspot_count
  from public.hotspot_daily as hotspot
  where lower(hotspot.source) not in ('synthetic', 'mock', 'demo')
  group by hotspot.province_id, hotspot.date
)
select
  air.province_id,
  air.date,
  air.pm25_mean,
  air.pm25_max,
  air.pm25_min,
  air.pm10_mean,
  air.aqi_mean,
  weather.temp_mean,
  weather.temp_max,
  weather.temp_min,
  weather.humidity_mean,
  weather.wind_speed_mean,
  weather.wind_speed_max,
  weather.wind_dir_mean,
  coalesce(hotspot.hotspot_count, 0)::integer as hotspot_count,
  air.hours_available,
  extract(month from air.date)::integer as month,
  extract(isodow from air.date)::integer - 1 as day_of_week,
  extract(month from air.date)::integer in (11, 12, 1, 2, 3, 4)
    as is_dry_season,
  extract(month from air.date)::integer in (1, 2, 3, 4)
    as is_burning_season,
  air.trusted_sources,
  air.trusted_observed_at
from trusted_air as air
left join trusted_weather as weather
  on weather.province_id = air.province_id
 and weather.date = air.date
left join trusted_hotspot as hotspot
  on hotspot.province_id = air.province_id
 and hotspot.date = air.date;

revoke all on public.trusted_daily_metrics_v1
  from public, anon, authenticated;
grant select on public.trusted_daily_metrics_v1 to service_role;

create or replace function public.fn_refresh_model_drift_metrics()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  upserted_count integer;
begin
  insert into public.model_drift_metrics (
    model_registry_id,
    province_id,
    window_start,
    window_end,
    horizon_days,
    sample_count,
    mae,
    rmse,
    bias,
    interval_coverage,
    feature_drift,
    residual_drift
  )
  select
    registry.id,
    forecast.province_id,
    min(forecast.target_date),
    max(forecast.target_date),
    forecast.forecast_horizon_days,
    count(*)::integer,
    avg(evaluation.absolute_error),
    sqrt(avg(evaluation.squared_error)),
    avg(evaluation.actual_pm25 - forecast.pm25_mean_forecast),
    avg(
      case
        when evaluation.interval_covered is true then 1.0
        when evaluation.interval_covered is false then 0.0
        else null
      end
    ),
    '{}'::jsonb,
    jsonb_build_object(
      'mean_error',
      avg(evaluation.actual_pm25 - forecast.pm25_mean_forecast),
      'window_days',
      30
    )
  from public.forecast_evaluations as evaluation
  join public.forecast_daily as forecast
    on forecast.id = evaluation.forecast_daily_id
  join public.model_registry as registry
    on registry.province_id = forecast.province_id
   and registry.task_type = 'regression'
   and registry.model_name = forecast.regression_model_name
   and registry.run_id = forecast.regression_run_id
  where forecast.target_date >= current_date - 30
    and forecast.forecast_horizon_days between 1 and 14
  group by
    registry.id,
    forecast.province_id,
    forecast.forecast_horizon_days
  on conflict (
    model_registry_id,
    window_start,
    window_end,
    horizon_days
  )
  do update set
    sample_count = excluded.sample_count,
    mae = excluded.mae,
    rmse = excluded.rmse,
    bias = excluded.bias,
    interval_coverage = excluded.interval_coverage,
    feature_drift = excluded.feature_drift,
    residual_drift = excluded.residual_drift,
    created_at = now();

  get diagnostics upserted_count = row_count;
  return jsonb_build_object('upserted', upserted_count);
end;
$$;

revoke all on function public.fn_refresh_model_drift_metrics()
  from public, anon, authenticated;
grant execute on function public.fn_refresh_model_drift_metrics()
  to service_role;

create or replace function public.fn_daily_pipeline()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  started_at timestamptz := clock_timestamp();
  max_observed_date date;
  build_date date;
  built_rows integer := 0;
  cleanup_result jsonb;
  ml_secret text;
  base_url text;
  ml_url text;
  request_id bigint;
  pipeline_status text;
  result jsonb;
begin
  update public.sync_state
  set status = 'running',
      last_run_at = started_at,
      error_msg = null,
      updated_at = now()
  where job_name = 'daily_pipeline';

  select max(
    (air.observed_at at time zone 'Asia/Bangkok')::date
  )
  into max_observed_date
  from public.air_quality_hourly as air
  where air.pm25 is not null
    and lower(air.source) not in ('synthetic', 'mock', 'demo')
    and air.observed_at <= date_trunc('hour', now());

  if max_observed_date is null then
    update public.sync_state
    set status = 'skipped',
        error_msg = 'no trusted PM2.5 data',
        updated_at = now()
    where job_name = 'daily_pipeline';
    return jsonb_build_object(
      'status', 'skipped',
      'reason', 'no trusted PM2.5 data'
    );
  end if;

  for build_date in
    select generate_series(
      max_observed_date - 1,
      max_observed_date,
      interval '1 day'
    )::date
  loop
    built_rows := built_rows
      + public.fn_build_daily_summary(build_date);
  end loop;

  cleanup_result := public.fn_cleanup_old_data();

  begin
    select secret.decrypted_secret
    into ml_secret
    from vault.decrypted_secrets as secret
    where secret.name = 'ml_secret'
    limit 1;

    select secret.decrypted_secret
    into base_url
    from vault.decrypted_secrets as secret
    where secret.name = 'vercel_base_url'
    limit 1;

    base_url := coalesce(
      nullif(trim(base_url), ''),
      'https://northeastthailand-airquality.vercel.app'
    );
    ml_url := rtrim(base_url, '/') || '/api/cron/ml-forecast';

    if nullif(trim(ml_secret), '') is not null then
      select net.http_post(
        url := ml_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || ml_secret
        ),
        body := '{}'::jsonb
      )
      into request_id;
    end if;
  exception when others then
    request_id := null;
  end;

  pipeline_status := case
    when request_id is not null then 'success'
    else 'partial'
  end;

  if request_id is null then
    perform public.fn_record_pipeline_alert(
      'daily_pipeline',
      'ml-forecast-trigger',
      'Daily data processing completed but ML forecast could not be triggered.',
      'warning',
      jsonb_build_object('as_of', max_observed_date)
    );
  else
    perform public.fn_resolve_pipeline_alert(
      'daily_pipeline',
      'ml-forecast-trigger'
    );
  end if;

  result := jsonb_build_object(
    'status', pipeline_status,
    'as_of', max_observed_date,
    'daily_rows_built', built_rows,
    'fallback_forecast_rows', 0,
    'cleanup', cleanup_result,
    'ml_inference_triggered', request_id is not null,
    'ml_request_id', request_id,
    'training_performed', false,
    'duration_ms',
      extract(epoch from clock_timestamp() - started_at) * 1000
  );

  insert into public.cron_log (
    job_name,
    started_at,
    finished_at,
    status,
    duration_ms,
    records_out,
    meta
  )
  values (
    'daily_pipeline',
    started_at,
    clock_timestamp(),
    pipeline_status,
    (
      extract(epoch from clock_timestamp() - started_at) * 1000
    )::integer,
    built_rows,
    result
  );

  update public.sync_state
  set status = pipeline_status,
      last_run_at = started_at,
      last_success_at = case
        when pipeline_status = 'success' then now()
        else last_success_at
      end,
      records_processed = built_rows,
      duration_ms = (
        extract(epoch from clock_timestamp() - started_at) * 1000
      )::integer,
      error_msg = case
        when pipeline_status = 'success' then null
        else 'ML forecast trigger failed; last auditable forecast retained'
      end,
      updated_at = now()
  where job_name = 'daily_pipeline';

  update public.sync_state
  set status = 'success',
      last_run_at = started_at,
      last_success_at = now(),
      records_processed = 0,
      duration_ms = (
        extract(epoch from clock_timestamp() - started_at) * 1000
      )::integer,
      error_msg = null,
      updated_at = now()
  where job_name = 'daily_cleanup';

  return result;
exception when others then
  insert into public.cron_log (
    job_name,
    started_at,
    finished_at,
    status,
    error_msg
  )
  values (
    'daily_pipeline',
    started_at,
    clock_timestamp(),
    'error',
    sqlerrm
  );

  update public.sync_state
  set status = 'error',
      last_run_at = started_at,
      error_msg = sqlerrm,
      updated_at = now()
  where job_name in ('daily_pipeline', 'daily_cleanup');

  return jsonb_build_object('status', 'error', 'error', sqlerrm);
end;
$$;

revoke all on function public.fn_daily_pipeline()
  from public, anon, authenticated;
grant execute on function public.fn_daily_pipeline() to service_role;

insert into public.sync_state (
  job_name,
  source,
  schedule,
  status
)
values
  (
    'daily_pipeline',
    'internal',
    'daily_01_30_Asia_Bangkok',
    'idle'
  ),
  (
    'forecast_generate',
    'disabled_legacy_fallback',
    'disabled',
    'idle'
  )
on conflict (job_name) do update
set source = excluded.source,
    schedule = excluded.schedule,
    status = case
      when public.sync_state.status = 'running'
      then public.sync_state.status
      else excluded.status
    end,
    error_msg = null,
    updated_at = now();

update public.sync_state
set source = 'offline_colab_or_github',
    schedule = 'manual_only',
    updated_at = now()
where job_name = 'model_retrain';

drop policy if exists "public read cron_log" on public.cron_log;
drop policy if exists "public read model_registry" on public.model_registry;
drop policy if exists "public read sync_state" on public.sync_state;

revoke all privileges on table public.cron_log
  from anon, authenticated;
revoke all privileges on table public.model_registry
  from anon, authenticated;
revoke all privileges on table public.sync_state
  from anon, authenticated;

grant select, insert, update, delete on table public.cron_log
  to service_role;
grant select, insert, update, delete on table public.model_registry
  to service_role;
grant select, insert, update, delete on table public.sync_state
  to service_role;
