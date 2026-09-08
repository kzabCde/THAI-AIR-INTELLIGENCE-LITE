set lock_timeout = '5s';
set statement_timeout = '120s';

-- Production data remediation, 2026-09-09
-- Scope:
--   * fail-closed trusted-source allowlists for ML daily aggregation
--   * prevent complete daily aggregates from regressing to partial rows
--   * widen the daily rebuild window enough to self-heal one missed cron run
--   * stop treating an absent FIRMS event row as a confirmed zero
--   * repair the known 2026-07-28 aggregate from trusted DB rows only
--   * propagate repaired lag/rolling features through the following 14 days
-- No external HTTP/API call, model retraining, activation, forecast generation,
-- archive rewrite, or destructive data deletion is performed by this migration.

create or replace function public.fn_build_daily_summary(p_date date)
returns integer
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_rows integer;
  v_start timestamptz := (p_date::text || ' 00:00:00')::timestamp at time zone 'Asia/Bangkok';
  v_end   timestamptz := ((p_date + 1)::text || ' 00:00:00')::timestamp at time zone 'Asia/Bangkok';
begin
  with air_dedup as (
    select distinct on (province_id, observed_at)
      province_id, observed_at, pm25, pm10, aqi
    from public.air_quality_hourly
    where observed_at >= v_start
      and observed_at < v_end
      and lower(source) in ('open-meteo', 'waqi', 'air4thai', 'openaq')
    order by province_id, observed_at,
      case lower(source)
        when 'open-meteo' then 1
        when 'air4thai' then 2
        when 'waqi' then 3
        when 'openaq' then 4
        else 99
      end
  ),
  wx_dedup as (
    select distinct on (province_id, observed_at)
      province_id, observed_at, temperature, humidity, wind_speed, wind_direction,
      pressure, precipitation, cloud_cover
    from public.weather_hourly
    where observed_at >= v_start
      and observed_at < v_end
      and lower(source) = 'open-meteo'
    order by province_id, observed_at
  ),
  air as (
    select province_id,
           avg(pm25)::numeric as pm25_mean,
           max(pm25)::numeric as pm25_max,
           min(pm25)::numeric as pm25_min,
           percentile_cont(0.75) within group (order by pm25)::numeric as pm25_p75,
           percentile_cont(0.90) within group (order by pm25)::numeric as pm25_p90,
           avg(pm10)::numeric as pm10_mean,
           avg(aqi)::numeric as aqi_mean,
           max(aqi) as aqi_max,
           count(*)::integer as hours_available
    from air_dedup
    group by province_id
  ),
  wx as (
    select province_id,
           avg(temperature)::numeric as temp_mean,
           max(temperature)::numeric as temp_max,
           min(temperature)::numeric as temp_min,
           avg(humidity)::numeric as humidity_mean,
           avg(wind_speed)::numeric as wind_speed_mean,
           max(wind_speed)::numeric as wind_speed_max,
           avg(wind_direction)::numeric as wind_dir_mean,
           avg(pressure)::numeric as pressure_mean,
           sum(precipitation)::numeric as precip_total,
           avg(cloud_cover)::numeric as cloud_cover_mean
    from wx_dedup
    group by province_id
  ),
  hs as (
    select province_id,
           sum(hotspot_count)::integer as hotspot_count,
           sum(coalesce(total_frp, 0))::numeric as total_frp
    from public.hotspot_daily
    where date = p_date
      and lower(source) = 'firms-viirs'
    group by province_id
  )
  insert into public.daily_summary as d (
    province_id, date,
    pm25_mean, pm25_max, pm25_min, pm25_p75, pm25_p90,
    pm10_mean, aqi_mean, aqi_max, hours_available,
    temp_mean, temp_max, temp_min, humidity_mean,
    wind_speed_mean, wind_speed_max, wind_dir_mean,
    pressure_mean, precip_total, cloud_cover_mean,
    hotspot_count, total_frp,
    day_of_week, month, is_dry_season, is_burning_season, is_weekend,
    created_at, updated_at
  )
  select
    a.province_id, p_date,
    round(a.pm25_mean, 2), round(a.pm25_max, 2), round(a.pm25_min, 2),
    round(a.pm25_p75, 2), round(a.pm25_p90, 2),
    round(a.pm10_mean, 2), round(a.aqi_mean, 2), a.aqi_max, a.hours_available,
    round(w.temp_mean, 2), round(w.temp_max, 2), round(w.temp_min, 2), round(w.humidity_mean, 2),
    round(w.wind_speed_mean, 2), round(w.wind_speed_max, 2), round(w.wind_dir_mean, 2),
    round(w.pressure_mean, 2), round(w.precip_total, 2), round(w.cloud_cover_mean, 2),
    h.hotspot_count, h.total_frp,
    extract(dow from p_date)::smallint,
    extract(month from p_date)::smallint,
    extract(month from p_date) in (11, 12, 1, 2, 3, 4),
    extract(month from p_date) in (2, 3, 4),
    extract(dow from p_date) in (0, 6),
    now(), now()
  from air a
  left join wx w on w.province_id = a.province_id
  left join hs h on h.province_id = a.province_id
  on conflict (province_id, date) do update set
    pm25_mean = excluded.pm25_mean,
    pm25_max = excluded.pm25_max,
    pm25_min = excluded.pm25_min,
    pm25_p75 = excluded.pm25_p75,
    pm25_p90 = excluded.pm25_p90,
    pm10_mean = excluded.pm10_mean,
    aqi_mean = excluded.aqi_mean,
    aqi_max = excluded.aqi_max,
    hours_available = excluded.hours_available,
    temp_mean = excluded.temp_mean,
    temp_max = excluded.temp_max,
    temp_min = excluded.temp_min,
    humidity_mean = excluded.humidity_mean,
    wind_speed_mean = excluded.wind_speed_mean,
    wind_speed_max = excluded.wind_speed_max,
    wind_dir_mean = excluded.wind_dir_mean,
    pressure_mean = excluded.pressure_mean,
    precip_total = excluded.precip_total,
    cloud_cover_mean = excluded.cloud_cover_mean,
    hotspot_count = excluded.hotspot_count,
    total_frp = excluded.total_frp,
    updated_at = now()
  where coalesce(excluded.hours_available, 0) >= coalesce(d.hours_available, 0);

  get diagnostics v_rows = row_count;

  update public.daily_summary d set
    pm25_lag_1d = l.lag1,
    pm25_lag_3d = l.lag3,
    pm25_lag_7d = l.lag7,
    pm25_roll3 = round(r.r3::numeric, 2),
    pm25_roll7 = round(r.r7::numeric, 2),
    pm25_roll14 = round(r.r14::numeric, 2),
    pm25_std7 = round(r.s7::numeric, 2),
    precip_roll3 = round(r.pr3::numeric, 2),
    precip_roll7 = round(r.pr7::numeric, 2),
    hotspot_roll3 = round(r.hr3::numeric, 2),
    hotspot_roll7 = round(r.hr7::numeric, 2),
    updated_at = now()
  from (
    select ds.province_id,
      (select pm25_mean from public.daily_summary x where x.province_id = ds.province_id and x.date = p_date - 1) as lag1,
      (select pm25_mean from public.daily_summary x where x.province_id = ds.province_id and x.date = p_date - 3) as lag3,
      (select pm25_mean from public.daily_summary x where x.province_id = ds.province_id and x.date = p_date - 7) as lag7
    from public.daily_summary ds
    where ds.date = p_date
  ) l,
  lateral (
    select
      avg(pm25_mean) filter (where date > p_date - 3) as r3,
      avg(pm25_mean) filter (where date > p_date - 7) as r7,
      avg(pm25_mean) filter (where date > p_date - 14) as r14,
      stddev_samp(pm25_mean) filter (where date > p_date - 7) as s7,
      avg(precip_total) filter (where date > p_date - 3) as pr3,
      avg(precip_total) filter (where date > p_date - 7) as pr7,
      avg(hotspot_count::numeric) filter (where date > p_date - 3) as hr3,
      avg(hotspot_count::numeric) filter (where date > p_date - 7) as hr7
    from public.daily_summary
    where province_id = l.province_id
      and date <= p_date
      and date > p_date - 14
  ) r
  where d.date = p_date
    and d.province_id = l.province_id;

  update public.daily_summary d set
    neighbor_pm25_avg = round(n.avg_pm::numeric, 2),
    neighbor_pm25_max = round(n.max_pm::numeric, 2),
    neighbor_pm25_min = round(n.min_pm::numeric, 2),
    regional_pm25_avg = round(reg.r_pm::numeric, 2),
    regional_wind_speed_avg = round(reg.r_wind::numeric, 2),
    regional_humidity_avg = round(reg.r_hum::numeric, 2),
    updated_at = now()
  from (select province_id from public.daily_summary where date = p_date) base
  left join lateral (
    select avg(x.pm25_mean) avg_pm, max(x.pm25_mean) max_pm, min(x.pm25_mean) min_pm
    from public.province_neighbours pn
    join public.daily_summary x
      on x.province_id = pn.neighbour_id
     and x.date = p_date
    where pn.province_id = base.province_id
  ) n on true
  cross join (
    select
      avg(pm25_mean) r_pm,
      avg(wind_speed_mean) r_wind,
      avg(humidity_mean) r_hum
    from public.daily_summary
    where date = p_date
  ) reg
  where d.date = p_date
    and d.province_id = base.province_id;

  return v_rows;
end;
$$;

revoke all on function public.fn_build_daily_summary(date) from public, anon, authenticated;
grant execute on function public.fn_build_daily_summary(date) to service_role;

create or replace view public.training_daily_summary_v2
with (security_invoker = true)
as
with air_lineage as (
  select
    aq.province_id,
    (aq.observed_at at time zone 'Asia/Bangkok')::date as date,
    count(distinct date_trunc('hour', aq.observed_at at time zone 'Asia/Bangkok'))
      filter (
        where aq.pm25 is not null
          and lower(aq.source) in ('open-meteo', 'waqi', 'air4thai', 'openaq')
      )::integer as trusted_hours,
    array_agg(distinct aq.source order by aq.source)
      filter (
        where aq.pm25 is not null
          and lower(aq.source) in ('open-meteo', 'waqi', 'air4thai', 'openaq')
      ) as trusted_sources,
    max(aq.observed_at)
      filter (
        where aq.pm25 is not null
          and lower(aq.source) in ('open-meteo', 'waqi', 'air4thai', 'openaq')
      ) as trusted_observed_at
  from public.air_quality_hourly aq
  group by aq.province_id, (aq.observed_at at time zone 'Asia/Bangkok')::date
),
hotspot_lineage as (
  select
    hd.province_id,
    hd.date,
    sum(hd.hotspot_count)::integer as observed_hotspot_count,
    sum(coalesce(hd.total_frp, 0)) as observed_total_frp,
    array_agg(distinct hd.source order by hd.source) as observed_hotspot_sources
  from public.hotspot_daily hd
  where lower(hd.source) = 'firms-viirs'
  group by hd.province_id, hd.date
)
select
  ds.id,
  ds.province_id,
  ds.date,
  ds.pm25_mean,
  ds.pm25_max,
  ds.pm25_min,
  ds.pm25_p75,
  ds.pm25_p90,
  ds.pm10_mean,
  ds.aqi_mean,
  ds.aqi_max,
  ds.hours_available,
  ds.temp_mean,
  ds.temp_max,
  ds.temp_min,
  ds.humidity_mean,
  ds.wind_speed_mean,
  ds.wind_speed_max,
  ds.wind_dir_mean,
  ds.pressure_mean,
  ds.precip_total,
  ds.cloud_cover_mean,
  ds.hotspot_count,
  ds.total_frp,
  ds.pm25_lag_1d,
  ds.pm25_lag_3d,
  ds.pm25_lag_7d,
  ds.pm25_roll3,
  ds.pm25_roll7,
  ds.pm25_roll14,
  ds.pm25_std7,
  ds.precip_roll3,
  ds.precip_roll7,
  ds.hotspot_roll3,
  ds.hotspot_roll7,
  ds.neighbor_pm25_avg,
  ds.neighbor_pm25_max,
  ds.neighbor_pm25_min,
  ds.regional_pm25_avg,
  ds.regional_wind_speed_avg,
  ds.regional_humidity_avg,
  ds.day_of_week,
  ds.month,
  ds.is_dry_season,
  ds.is_burning_season,
  ds.is_weekend,
  ds.created_at,
  ds.updated_at,
  air_lineage.trusted_hours,
  air_lineage.trusted_sources,
  hotspot_lineage.province_id is not null as hotspot_lineage_is_trusted,
  hotspot_lineage.observed_hotspot_count,
  hotspot_lineage.observed_total_frp,
  hotspot_lineage.observed_hotspot_sources,
  jsonb_build_object(
    'pm25', jsonb_build_object(
      'trusted_hours', air_lineage.trusted_hours,
      'sources', to_jsonb(air_lineage.trusted_sources),
      'synthetic_allowed', false,
      'source_policy', 'explicit_allowlist_v1'
    ),
    'hotspot', jsonb_build_object(
      'eligible', hotspot_lineage.province_id is not null,
      'sources', coalesce(to_jsonb(hotspot_lineage.observed_hotspot_sources), '[]'::jsonb),
      'absence_semantics', case
        when hotspot_lineage.province_id is not null then 'DETECTION_ROW_PRESENT'
        else 'NOT_CONFIRMED'
      end,
      'excluded_from_feature_version', 'daily-pooled-v1'
    )
  ) as feature_provenance,
  air_lineage.trusted_observed_at
from public.daily_summary ds
join air_lineage
  on air_lineage.province_id = ds.province_id
 and air_lineage.date = ds.date
left join hotspot_lineage
  on hotspot_lineage.province_id = ds.province_id
 and hotspot_lineage.date = ds.date
where air_lineage.trusted_hours >= 18
  and coalesce(ds.hours_available::integer, 0) >= 18;

revoke all on public.training_daily_summary_v2 from public, anon, authenticated;
grant select on public.training_daily_summary_v2 to service_role;

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
from public.hotspot_daily hotspot
where lower(hotspot.source) = 'firms-viirs';

revoke all on public.observed_hotspot_daily_v1 from public, anon, authenticated;
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
    count(distinct date_trunc('hour', air.observed_at at time zone 'Asia/Bangkok'))::integer as hours_available,
    array_agg(distinct air.source order by air.source) as trusted_sources,
    max(air.observed_at) as trusted_observed_at
  from public.air_quality_hourly air
  where air.pm25 is not null
    and air.observed_at <= date_trunc('hour', now())
    and lower(air.source) in ('open-meteo', 'waqi', 'air4thai', 'openaq')
  group by air.province_id, (air.observed_at at time zone 'Asia/Bangkok')::date
  having count(distinct date_trunc('hour', air.observed_at at time zone 'Asia/Bangkok')) >= 18
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
  from public.weather_hourly weather
  where weather.observed_at <= date_trunc('hour', now())
    and lower(weather.source) = 'open-meteo'
  group by weather.province_id, (weather.observed_at at time zone 'Asia/Bangkok')::date
),
trusted_hotspot as (
  select
    hotspot.province_id,
    hotspot.date,
    sum(hotspot.hotspot_count)::integer as hotspot_count
  from public.hotspot_daily hotspot
  where lower(hotspot.source) = 'firms-viirs'
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
  hotspot.hotspot_count,
  air.hours_available,
  extract(month from air.date)::integer as month,
  extract(isodow from air.date)::integer - 1 as day_of_week,
  extract(month from air.date)::integer in (11, 12, 1, 2, 3, 4) as is_dry_season,
  extract(month from air.date)::integer in (1, 2, 3, 4) as is_burning_season,
  air.trusted_sources,
  air.trusted_observed_at
from trusted_air air
left join trusted_weather weather
  on weather.province_id = air.province_id
 and weather.date = air.date
left join trusted_hotspot hotspot
  on hotspot.province_id = air.province_id
 and hotspot.date = air.date;

revoke all on public.trusted_daily_metrics_v1 from public, anon, authenticated;
grant select on public.trusted_daily_metrics_v1 to service_role;

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

  select max((air.observed_at at time zone 'Asia/Bangkok')::date)
  into max_observed_date
  from public.air_quality_hourly air
  where air.pm25 is not null
    and lower(air.source) in ('open-meteo', 'waqi', 'air4thai', 'openaq')
    and air.observed_at <= date_trunc('hour', now());

  if max_observed_date is null then
    update public.sync_state
    set status = 'skipped',
        error_msg = 'no trusted PM2.5 data',
        updated_at = now()
    where job_name = 'daily_pipeline';
    return jsonb_build_object('status', 'skipped', 'reason', 'no trusted PM2.5 data');
  end if;

  -- Three business dates are deliberately rebuilt. If one scheduled run fails,
  -- the next successful run still revisits the partially aggregated day.
  for build_date in
    select generate_series(
      max_observed_date - 2,
      max_observed_date,
      interval '1 day'
    )::date
  loop
    built_rows := built_rows + public.fn_build_daily_summary(build_date);
  end loop;

  cleanup_result := public.fn_cleanup_old_data();

  begin
    select secret.decrypted_secret
    into ml_secret
    from vault.decrypted_secrets secret
    where secret.name = 'ml_secret'
    limit 1;

    select secret.decrypted_secret
    into base_url
    from vault.decrypted_secrets secret
    where secret.name = 'vercel_base_url'
    limit 1;

    base_url := coalesce(nullif(trim(base_url), ''), 'https://northeastthailand-airquality.vercel.app');
    ml_url := rtrim(base_url, '/') || '/api/cron/ml-forecast';

    if nullif(trim(ml_secret), '') is not null then
      select net.http_post(
        url := ml_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || ml_secret
        ),
        body := '{}'::jsonb
      ) into request_id;
    end if;
  exception when others then
    request_id := null;
  end;

  pipeline_status := case when request_id is not null then 'success' else 'partial' end;

  if request_id is null then
    perform public.fn_record_pipeline_alert(
      'daily_pipeline',
      'ml-forecast-trigger',
      'Daily data processing completed but ML forecast could not be triggered.',
      'warning',
      jsonb_build_object('as_of', max_observed_date)
    );
  else
    perform public.fn_resolve_pipeline_alert('daily_pipeline', 'ml-forecast-trigger');
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
    'duration_ms', extract(epoch from clock_timestamp() - started_at) * 1000
  );

  insert into public.cron_log (
    job_name, started_at, finished_at, status, duration_ms, records_out, meta
  ) values (
    'daily_pipeline',
    started_at,
    clock_timestamp(),
    pipeline_status,
    (extract(epoch from clock_timestamp() - started_at) * 1000)::integer,
    built_rows,
    result
  );

  update public.sync_state
  set status = pipeline_status,
      last_run_at = started_at,
      last_success_at = case when pipeline_status = 'success' then now() else last_success_at end,
      records_processed = built_rows,
      duration_ms = (extract(epoch from clock_timestamp() - started_at) * 1000)::integer,
      error_msg = case when pipeline_status = 'success' then null else 'ML forecast trigger failed; last auditable forecast retained' end,
      updated_at = now()
  where job_name = 'daily_pipeline';

  update public.sync_state
  set status = 'success',
      last_run_at = started_at,
      last_success_at = now(),
      records_processed = 0,
      duration_ms = (extract(epoch from clock_timestamp() - started_at) * 1000)::integer,
      error_msg = null,
      updated_at = now()
  where job_name = 'daily_cleanup';

  return result;
exception when others then
  insert into public.cron_log (job_name, started_at, finished_at, status, error_msg)
  values ('daily_pipeline', started_at, clock_timestamp(), 'error', sqlerrm);

  update public.sync_state
  set status = 'error',
      last_run_at = started_at,
      error_msg = sqlerrm,
      updated_at = now()
  where job_name in ('daily_pipeline', 'daily_cleanup');

  return jsonb_build_object('status', 'error', 'error', sqlerrm);
end;
$$;

revoke all on function public.fn_daily_pipeline() from public, anon, authenticated;
grant execute on function public.fn_daily_pipeline() to service_role;

comment on column public.air_quality_hourly.aqi is
  'Source/version-specific historical AQI. It is not an input feature of daily-pooled-v1; canonical PM2.5 classification is versioned separately.';
comment on column public.air_quality_hourly.aqi_category is
  'Historical category availability is source/version dependent. It is not an input feature of daily-pooled-v1.';
comment on column public.daily_summary.hotspot_count is
  'NULL means no trusted FIRMS detection row was available for that province/date. Do not interpret NULL as a confirmed zero.';
comment on column public.daily_summary.total_frp is
  'NULL means no trusted FIRMS detection row was available for that province/date. Hotspot/FRP are excluded from daily-pooled-v1.';

-- Repair preconditions: the trusted raw rows for 2026-07-28 must already be complete.
do $$
declare
  v_air_rows integer;
  v_weather_rows integer;
  v_air_full integer;
  v_weather_full integer;
  v_date date;
begin
  select count(*)::integer,
         count(*) filter (where hours = 24)::integer
  into v_air_rows, v_air_full
  from (
    select province_id,
           count(*)::integer as row_count,
           count(distinct date_trunc('hour', observed_at at time zone 'Asia/Bangkok'))::integer as hours
    from public.air_quality_hourly
    where observed_at >= ('2026-07-28 00:00:00'::timestamp at time zone 'Asia/Bangkok')
      and observed_at < ('2026-07-29 00:00:00'::timestamp at time zone 'Asia/Bangkok')
      and lower(source) in ('open-meteo', 'waqi', 'air4thai', 'openaq')
    group by province_id
  ) s;

  if v_air_rows <> 20 or v_air_full <> 20 then
    raise exception '2026-07-28 trusted air precondition failed: provinces %, full %', v_air_rows, v_air_full;
  end if;

  select count(*)::integer,
         count(*) filter (where hours = 24)::integer
  into v_weather_rows, v_weather_full
  from (
    select province_id,
           count(distinct date_trunc('hour', observed_at at time zone 'Asia/Bangkok'))::integer as hours
    from public.weather_hourly
    where observed_at >= ('2026-07-28 00:00:00'::timestamp at time zone 'Asia/Bangkok')
      and observed_at < ('2026-07-29 00:00:00'::timestamp at time zone 'Asia/Bangkok')
      and lower(source) = 'open-meteo'
    group by province_id
  ) s;

  if v_weather_rows <> 20 or v_weather_full <> 20 then
    raise exception '2026-07-28 trusted weather precondition failed: provinces %, full %', v_weather_rows, v_weather_full;
  end if;

  perform public.fn_build_daily_summary('2026-07-28'::date);

  -- Propagate corrected lag/rolling/spatial features. The raw core observations
  -- for these dates are already trusted DB rows; no source fetch occurs here.
  for v_date in
    select generate_series('2026-07-29'::date, '2026-08-11'::date, interval '1 day')::date
  loop
    perform public.fn_build_daily_summary(v_date);
  end loop;

  if (select count(*) from public.daily_summary where date = '2026-07-28' and hours_available = 24) <> 20 then
    raise exception '2026-07-28 repair failed: expected 20 daily_summary rows with 24 hours';
  end if;

  if (select count(*) from public.training_daily_summary_v2 where date = '2026-07-28') <> 20 then
    raise exception '2026-07-28 repair failed: training_daily_summary_v2 does not expose all 20 provinces';
  end if;

  if (select count(*) from public.training_daily_summary_v3 where date = '2026-07-28') <> 20 then
    raise exception '2026-07-28 repair failed: training_daily_summary_v3 does not expose all 20 provinces';
  end if;
end;
$$;
