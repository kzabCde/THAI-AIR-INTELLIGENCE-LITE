-- Align ingestion, forecast dates, evaluation, public analytics and job status
-- with the data that production actually serves.

create or replace view public.air_quality_latest
with (security_invoker = true)
as
select distinct on (air.province_id)
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
where air.observed_at <= date_trunc('hour', now())
  and lower(air.source) not in ('synthetic', 'mock', 'demo')
order by air.province_id, air.observed_at desc;

create or replace view public.weather_latest
with (security_invoker = true)
as
select distinct on (weather.province_id)
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
where weather.observed_at <= date_trunc('hour', now())
  and lower(weather.source) not in ('synthetic', 'mock', 'demo')
order by weather.province_id, weather.observed_at desc;

grant select on public.air_quality_latest, public.weather_latest
  to anon, authenticated;

comment on view public.air_quality_latest is
  'Latest non-synthetic PM2.5 value at or before the current UTC hour for each province.';

comment on view public.weather_latest is
  'Latest non-synthetic weather value at or before the current UTC hour for each province.';

create or replace view public.training_daily_summary_v2
with (security_invoker = true)
as
with air_lineage as (
  select
    aq.province_id,
    (aq.observed_at at time zone 'Asia/Bangkok')::date as date,
    count(distinct date_trunc(
      'hour',
      aq.observed_at at time zone 'Asia/Bangkok'
    )) filter (
      where aq.pm25 is not null
        and lower(aq.source) not in ('synthetic', 'mock', 'demo')
    )::integer as trusted_hours,
    array_agg(distinct aq.source order by aq.source) filter (
      where aq.pm25 is not null
        and lower(aq.source) not in ('synthetic', 'mock', 'demo')
    ) as trusted_sources,
    max(aq.observed_at) filter (
      where aq.pm25 is not null
        and lower(aq.source) not in ('synthetic', 'mock', 'demo')
    ) as trusted_observed_at
  from public.air_quality_hourly as aq
  group by
    aq.province_id,
    (aq.observed_at at time zone 'Asia/Bangkok')::date
),
hotspot_lineage as (
  select
    hd.province_id,
    hd.date,
    sum(hd.hotspot_count)::integer as observed_hotspot_count,
    sum(coalesce(hd.total_frp, 0))::numeric as observed_total_frp,
    array_agg(distinct hd.source order by hd.source)
      as observed_hotspot_sources
  from public.hotspot_daily as hd
  where lower(hd.source) not in ('synthetic', 'mock', 'demo')
  group by hd.province_id, hd.date
)
select
  ds.*,
  air_lineage.trusted_hours,
  air_lineage.trusted_sources,
  (hotspot_lineage.province_id is not null) as hotspot_lineage_is_trusted,
  hotspot_lineage.observed_hotspot_count,
  hotspot_lineage.observed_total_frp,
  hotspot_lineage.observed_hotspot_sources,
  jsonb_build_object(
    'pm25', jsonb_build_object(
      'trusted_hours', air_lineage.trusted_hours,
      'sources', to_jsonb(air_lineage.trusted_sources),
      'synthetic_allowed', false
    ),
    'hotspot', jsonb_build_object(
      'eligible', hotspot_lineage.province_id is not null,
      'sources', coalesce(
        to_jsonb(hotspot_lineage.observed_hotspot_sources),
        '[]'::jsonb
      ),
      'excluded_from_feature_version', 'daily-observed-v4'
    )
  ) as feature_provenance,
  air_lineage.trusted_observed_at
from public.daily_summary as ds
join air_lineage
  on air_lineage.province_id = ds.province_id
 and air_lineage.date = ds.date
left join hotspot_lineage
  on hotspot_lineage.province_id = ds.province_id
 and hotspot_lineage.date = ds.date
where air_lineage.trusted_hours >= 18
  and coalesce(ds.hours_available, 0) >= 18;

revoke all on public.training_daily_summary_v2
  from public, anon, authenticated;
grant select on public.training_daily_summary_v2 to service_role;

comment on view public.training_daily_summary_v2 is
  'Observed PM2.5 daily features with explicit source lineage and the latest trusted source timestamp.';

create or replace view public.observed_daily_summary_v1
with (security_invoker = true)
as
with air_lineage as (
  select
    aq.province_id,
    (aq.observed_at at time zone 'Asia/Bangkok')::date as date,
    count(distinct date_trunc(
      'hour',
      aq.observed_at at time zone 'Asia/Bangkok'
    )) filter (
      where aq.pm25 is not null
        and lower(aq.source) not in ('synthetic', 'mock', 'demo')
    )::integer as trusted_hours,
    array_agg(distinct aq.source order by aq.source) filter (
      where aq.pm25 is not null
        and lower(aq.source) not in ('synthetic', 'mock', 'demo')
    ) as trusted_sources,
    max(aq.observed_at) filter (
      where aq.pm25 is not null
        and lower(aq.source) not in ('synthetic', 'mock', 'demo')
    ) as trusted_observed_at
  from public.air_quality_hourly as aq
  group by
    aq.province_id,
    (aq.observed_at at time zone 'Asia/Bangkok')::date
)
select
  ds.*,
  air_lineage.trusted_hours,
  air_lineage.trusted_sources,
  air_lineage.trusted_observed_at
from public.daily_summary as ds
join air_lineage
  on air_lineage.province_id = ds.province_id
 and air_lineage.date = ds.date
where air_lineage.trusted_hours >= 18
  and coalesce(ds.hours_available, 0) >= 18;

revoke all on public.observed_daily_summary_v1
  from public, anon, authenticated;
grant select on public.observed_daily_summary_v1 to anon, authenticated;

comment on view public.observed_daily_summary_v1 is
  'Public daily analytics restricted to complete, non-synthetic PM2.5 lineage.';

create index if not exists idx_air_quality_observed_lineage
  on public.air_quality_hourly (province_id, observed_at desc)
  where pm25 is not null
    and lower(source) not in ('synthetic', 'mock', 'demo');

create or replace function public.fn_evaluate_due_forecasts()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  evaluated_count integer;
begin
  insert into public.forecast_evaluations (
    forecast_daily_id,
    actual_pm25,
    actual_class,
    actual_source,
    actual_observed_at,
    absolute_error,
    squared_error,
    interval_covered,
    class_correct,
    evaluated_at
  )
  select
    forecast.id,
    observed.pm25_mean,
    case
      when observed.pm25_mean <= 15 then 1
      when observed.pm25_mean <= 25 then 2
      when observed.pm25_mean <= 37.5 then 3
      when observed.pm25_mean <= 75 then 4
      else 5
    end,
    coalesce(
      array_to_string(observed.trusted_sources, ','),
      'trusted_daily_summary'
    ),
    observed.trusted_observed_at,
    abs(observed.pm25_mean - forecast.pm25_mean_forecast),
    power(observed.pm25_mean - forecast.pm25_mean_forecast, 2),
    case
      when forecast.pm25_p10_forecast is null
        or forecast.pm25_p90_forecast is null
      then null
      else observed.pm25_mean between
        forecast.pm25_p10_forecast and forecast.pm25_p90_forecast
    end,
    case
      when forecast.displayed_class is null then null
      else forecast.displayed_class = case
        when observed.pm25_mean <= 15 then 1
        when observed.pm25_mean <= 25 then 2
        when observed.pm25_mean <= 37.5 then 3
        when observed.pm25_mean <= 75 then 4
        else 5
      end
    end,
    now()
  from public.forecast_daily as forecast
  join public.training_daily_summary_v2 as observed
    on observed.province_id = forecast.province_id
   and observed.date = forecast.target_date
  left join public.forecast_evaluations as existing
    on existing.forecast_daily_id = forecast.id
  where observed.pm25_mean is not null
    and existing.forecast_daily_id is null
  on conflict (forecast_daily_id) do nothing;

  get diagnostics evaluated_count = row_count;
  return jsonb_build_object('evaluated', evaluated_count);
end;
$$;

revoke all on function public.fn_evaluate_due_forecasts()
  from public, anon, authenticated;
grant execute on function public.fn_evaluate_due_forecasts()
  to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.forecast_daily'::regclass
      and conname = 'forecast_daily_future_target_check'
  ) then
    alter table public.forecast_daily
      add constraint forecast_daily_future_target_check
      check (
        target_date >
          (forecast_at at time zone 'Asia/Bangkok')::date
      ) not valid;
  end if;
end
$$;

create or replace function public.fn_sync_air_weather(
  p_past_days integer default 2
)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'extensions'
as $$
declare
  v_lats text;
  v_lons text;
  v_air_status integer;
  v_air_body text;
  v_wx_status integer;
  v_wx_body text;
  v_air_new_rows integer := 0;
  v_wx_new_rows integer := 0;
  v_air_prev_cursor timestamptz;
  v_wx_prev_cursor timestamptz;
  v_air_cursor timestamptz;
  v_wx_cursor timestamptz;
  v_air_state text;
  v_wx_state text;
  v_air_error text;
  v_wx_error text;
  v_status text;
  v_cutoff timestamptz := date_trunc('hour', now());
  v_start timestamptz := clock_timestamp();
begin
  if p_past_days < 1 or p_past_days > 7 then
    raise exception 'p_past_days must be between 1 and 7';
  end if;

  select max(observed_at)
  into v_air_prev_cursor
  from public.air_quality_hourly
  where source = 'open-meteo';

  select max(observed_at)
  into v_wx_prev_cursor
  from public.weather_hourly
  where source = 'open-meteo';

  select
    string_agg(lat::text, ',' order by province_id),
    string_agg(lon::text, ',' order by province_id)
  into v_lats, v_lons
  from public.isan_provinces;

  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '60');

  select response.status, response.content
  into v_air_status, v_air_body
  from extensions.http_get(
    'https://air-quality-api.open-meteo.com/v1/air-quality'
    || '?latitude=' || v_lats
    || '&longitude=' || v_lons
    || '&hourly=pm2_5,pm10'
    || '&past_days=' || p_past_days
    || '&forecast_days=1&timezone=UTC'
  ) as response;

  if v_air_status = 200 then
    with province_list as (
      select
        province_id,
        row_number() over (order by province_id) as idx
      from public.isan_provinces
    ),
    response_rows as (
      select elem, ord
      from jsonb_array_elements(v_air_body::jsonb)
        with ordinality as response(elem, ord)
    ),
    expanded as (
      select
        province.province_id,
        time_value.value::timestamp at time zone 'UTC' as observed_at,
        nullif(
          response.elem->'hourly'->'pm2_5'
            ->>(time_value.ord - 1)::integer,
          ''
        )::numeric as pm25,
        nullif(
          response.elem->'hourly'->'pm10'
            ->>(time_value.ord - 1)::integer,
          ''
        )::numeric as pm10
      from response_rows as response
      join province_list as province
        on province.idx = response.ord
      cross join lateral jsonb_array_elements_text(
        response.elem->'hourly'->'time'
      ) with ordinality as time_value(value, ord)
      where time_value.value::timestamp at time zone 'UTC' <= v_cutoff
    ),
    upserted as (
      insert into public.air_quality_hourly (
        province_id,
        observed_at,
        pm25,
        pm10,
        aqi,
        aqi_category,
        station_id,
        source,
        created_at
      )
      select
        province_id,
        observed_at,
        pm25,
        pm10,
        case
          when pm25 is null then null
          when pm25 <= 12 then round(pm25 / 12 * 50)
          when pm25 <= 35.4
            then round(50 + (pm25 - 12) / (35.4 - 12) * 49)
          when pm25 <= 55.4
            then round(100 + (pm25 - 35.4) / (55.4 - 35.4) * 49)
          when pm25 <= 150.4
            then round(150 + (pm25 - 55.4) / (150.4 - 55.4) * 49)
          when pm25 <= 250.4
            then round(200 + (pm25 - 150.4) / (250.4 - 150.4) * 99)
          else round(300 + (pm25 - 250.4) / (500.4 - 250.4) * 199)
        end::integer,
        case
          when pm25 is null then null
          when pm25 <= 12 then 'Good'
          when pm25 <= 35.4 then 'Moderate'
          when pm25 <= 55.4 then 'Unhealthy for Sensitive Groups'
          when pm25 <= 150.4 then 'Unhealthy'
          when pm25 <= 250.4 then 'Very Unhealthy'
          else 'Hazardous'
        end,
        null,
        'open-meteo',
        now()
      from expanded
      where pm25 is not null
      on conflict (province_id, observed_at, source) do update set
        pm25 = excluded.pm25,
        pm10 = excluded.pm10,
        aqi = excluded.aqi,
        aqi_category = excluded.aqi_category
      where (
        public.air_quality_hourly.pm25,
        public.air_quality_hourly.pm10,
        public.air_quality_hourly.aqi,
        public.air_quality_hourly.aqi_category
      ) is distinct from (
        excluded.pm25,
        excluded.pm10,
        excluded.aqi,
        excluded.aqi_category
      )
      returning observed_at
    )
    select count(*) filter (
      where v_air_prev_cursor is null
         or observed_at > v_air_prev_cursor
    )::integer
    into v_air_new_rows
    from upserted;
  end if;

  select max(observed_at)
  into v_air_cursor
  from public.air_quality_hourly
  where source = 'open-meteo'
    and observed_at <= v_cutoff;

  if v_air_status is distinct from 200 then
    v_air_state := 'error';
    v_air_error := 'air http ' || coalesce(v_air_status::text, 'null');
  elsif v_air_cursor is null
    or v_air_cursor < v_cutoff - interval '1 hour'
  then
    v_air_state := 'stale';
    v_air_error := 'air cursor is more than one hour behind';
  else
    v_air_state := 'success';
  end if;

  update public.sync_state
  set status = v_air_state,
      last_run_at = v_start,
      last_success_at = case
        when v_air_state = 'success' then now()
        else last_success_at
      end,
      records_processed = v_air_new_rows,
      cursor_at = v_air_cursor,
      duration_ms = round(
        extract(epoch from clock_timestamp() - v_start) * 1000
      )::integer,
      error_msg = v_air_error,
      updated_at = now()
  where job_name = 'pm25_sync';

  select response.status, response.content
  into v_wx_status, v_wx_body
  from extensions.http_get(
    'https://api.open-meteo.com/v1/forecast'
    || '?latitude=' || v_lats
    || '&longitude=' || v_lons
    || '&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,'
    || 'wind_direction_10m,surface_pressure,precipitation,cloud_cover,'
    || 'visibility'
    || '&past_days=' || p_past_days
    || '&forecast_days=1&timezone=UTC'
  ) as response;

  if v_wx_status = 200 then
    with province_list as (
      select
        province_id,
        row_number() over (order by province_id) as idx
      from public.isan_provinces
    ),
    response_rows as (
      select elem, ord
      from jsonb_array_elements(v_wx_body::jsonb)
        with ordinality as response(elem, ord)
    ),
    expanded as (
      select
        province.province_id,
        time_value.value::timestamp at time zone 'UTC' as observed_at,
        nullif(
          response.elem->'hourly'->'temperature_2m'
            ->>(time_value.ord - 1)::integer,
          ''
        )::numeric as temperature,
        nullif(
          response.elem->'hourly'->'relative_humidity_2m'
            ->>(time_value.ord - 1)::integer,
          ''
        )::numeric as humidity,
        nullif(
          response.elem->'hourly'->'wind_speed_10m'
            ->>(time_value.ord - 1)::integer,
          ''
        )::numeric as wind_speed,
        nullif(
          response.elem->'hourly'->'wind_direction_10m'
            ->>(time_value.ord - 1)::integer,
          ''
        )::numeric as wind_direction,
        nullif(
          response.elem->'hourly'->'surface_pressure'
            ->>(time_value.ord - 1)::integer,
          ''
        )::numeric as pressure,
        nullif(
          response.elem->'hourly'->'precipitation'
            ->>(time_value.ord - 1)::integer,
          ''
        )::numeric as precipitation,
        nullif(
          response.elem->'hourly'->'cloud_cover'
            ->>(time_value.ord - 1)::integer,
          ''
        )::numeric as cloud_cover,
        round(
          nullif(
            response.elem->'hourly'->'visibility'
              ->>(time_value.ord - 1)::integer,
            ''
          )::numeric / 1000,
          2
        ) as visibility
      from response_rows as response
      join province_list as province
        on province.idx = response.ord
      cross join lateral jsonb_array_elements_text(
        response.elem->'hourly'->'time'
      ) with ordinality as time_value(value, ord)
      where time_value.value::timestamp at time zone 'UTC' <= v_cutoff
    ),
    upserted as (
      insert into public.weather_hourly (
        province_id,
        observed_at,
        temperature,
        humidity,
        wind_speed,
        wind_direction,
        pressure,
        precipitation,
        cloud_cover,
        visibility,
        source,
        created_at
      )
      select
        province_id,
        observed_at,
        temperature,
        humidity,
        wind_speed,
        wind_direction,
        pressure,
        precipitation,
        cloud_cover,
        visibility,
        'open-meteo',
        now()
      from expanded
      where temperature is not null
      on conflict (province_id, observed_at, source) do update set
        temperature = excluded.temperature,
        humidity = excluded.humidity,
        wind_speed = excluded.wind_speed,
        wind_direction = excluded.wind_direction,
        pressure = excluded.pressure,
        precipitation = excluded.precipitation,
        cloud_cover = excluded.cloud_cover,
        visibility = excluded.visibility
      where (
        public.weather_hourly.temperature,
        public.weather_hourly.humidity,
        public.weather_hourly.wind_speed,
        public.weather_hourly.wind_direction,
        public.weather_hourly.pressure,
        public.weather_hourly.precipitation,
        public.weather_hourly.cloud_cover,
        public.weather_hourly.visibility
      ) is distinct from (
        excluded.temperature,
        excluded.humidity,
        excluded.wind_speed,
        excluded.wind_direction,
        excluded.pressure,
        excluded.precipitation,
        excluded.cloud_cover,
        excluded.visibility
      )
      returning observed_at
    )
    select count(*) filter (
      where v_wx_prev_cursor is null
         or observed_at > v_wx_prev_cursor
    )::integer
    into v_wx_new_rows
    from upserted;
  end if;

  select max(observed_at)
  into v_wx_cursor
  from public.weather_hourly
  where source = 'open-meteo'
    and observed_at <= v_cutoff;

  if v_wx_status is distinct from 200 then
    v_wx_state := 'error';
    v_wx_error := 'weather http ' || coalesce(v_wx_status::text, 'null');
  elsif v_wx_cursor is null
    or v_wx_cursor < v_cutoff - interval '1 hour'
  then
    v_wx_state := 'stale';
    v_wx_error := 'weather cursor is more than one hour behind';
  else
    v_wx_state := 'success';
  end if;

  update public.sync_state
  set status = v_wx_state,
      last_run_at = v_start,
      last_success_at = case
        when v_wx_state = 'success' then now()
        else last_success_at
      end,
      records_processed = v_wx_new_rows,
      cursor_at = v_wx_cursor,
      duration_ms = round(
        extract(epoch from clock_timestamp() - v_start) * 1000
      )::integer,
      error_msg = v_wx_error,
      updated_at = now()
  where job_name = 'weather_sync';

  v_status := case
    when v_air_state = 'success' and v_wx_state = 'success'
      then 'success'
    when v_air_state = 'error' or v_wx_state = 'error'
      then 'error'
    else 'partial'
  end;

  return jsonb_build_object(
    'status', v_status,
    'air_status', v_air_state,
    'weather_status', v_wx_state,
    'air_new_rows', v_air_new_rows,
    'weather_new_rows', v_wx_new_rows,
    'air_cursor_before', v_air_prev_cursor,
    'air_cursor_after', v_air_cursor,
    'weather_cursor_before', v_wx_prev_cursor,
    'weather_cursor_after', v_wx_cursor,
    'cutoff', v_cutoff
  );
end;
$$;

comment on function public.fn_sync_air_weather(integer) is
  'Fetches current Open-Meteo UTC data, removes future hours, records only cursor advances as new rows, and reports stale sources explicitly.';

create or replace function public.fn_generate_forecast(
  p_horizon integer default 7
)
returns integer
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_now timestamptz := now();
  v_bangkok_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_first_target date := v_bangkok_today + 1;
  v_count integer := 0;
  v_model text := 'persist-revert-v2';
begin
  if p_horizon < 1 or p_horizon > 14 then
    raise exception 'p_horizon must be between 1 and 14';
  end if;

  delete from public.forecast_daily
  where model_name = v_model
    and (forecast_at at time zone 'Asia/Bangkok')::date = v_bangkok_today;

  with anchor as (
    select distinct on (summary.province_id)
      summary.province_id,
      summary.date as source_date,
      summary.pm25_mean as last_value,
      coalesce(summary.pm25_roll7, summary.pm25_mean) as roll7,
      summary.trusted_observed_at
    from public.training_daily_summary_v2 as summary
    where summary.pm25_mean is not null
    order by summary.province_id, summary.date desc
  ),
  horizon as (
    select generate_series(1, p_horizon) as horizon_days
  ),
  calculated as (
    select
      anchor.province_id,
      anchor.source_date,
      anchor.trusted_observed_at,
      horizon.horizon_days,
      greatest(
        1,
        (v_first_target - anchor.source_date)
          + horizon.horizon_days - 1
      ) as recursive_step,
      v_first_target + horizon.horizon_days - 1 as target_date,
      greatest(
        0,
        round((
          anchor.last_value
          + (
            1 - power(
              0.85,
              greatest(
                1,
                (v_first_target - anchor.source_date)
                  + horizon.horizon_days - 1
              )
            )
          ) * (anchor.roll7 - anchor.last_value)
        )::numeric, 2)
      ) as prediction
    from anchor
    cross join horizon
  )
  insert into public.forecast_daily (
    province_id,
    forecast_at,
    target_date,
    pm25_mean_forecast,
    pm25_max_forecast,
    pm25_p10_forecast,
    pm25_p50_forecast,
    pm25_p90_forecast,
    model_name,
    regression_model_name,
    regression_derived_class,
    displayed_class,
    classification_source,
    fallback_used,
    fallback_reason,
    data_freshness,
    feature_version,
    forecast_horizon_days,
    horizon_reliability,
    is_experimental,
    uncertainty_method,
    created_at
  )
  select
    calculated.province_id,
    v_now,
    calculated.target_date,
    calculated.prediction,
    round((calculated.prediction * 1.35)::numeric, 2),
    round((calculated.prediction * 0.75)::numeric, 2),
    calculated.prediction,
    round((calculated.prediction * 1.35)::numeric, 2),
    v_model,
    v_model,
    case
      when calculated.prediction <= 15 then 1
      when calculated.prediction <= 25 then 2
      when calculated.prediction <= 37.5 then 3
      when calculated.prediction <= 75 then 4
      else 5
    end,
    case
      when calculated.prediction <= 15 then 1
      when calculated.prediction <= 25 then 2
      when calculated.prediction <= 37.5 then 3
      when calculated.prediction <= 75 then 4
      else 5
    end,
    'regression_threshold',
    true,
    case
      when calculated.recursive_step > 1
        then 'stale_or_partial_source_recursive_fallback'
      else 'persistence_regression_fallback'
    end,
    calculated.trusted_observed_at,
    'fallback-observed-history-v1',
    calculated.horizon_days,
    case
      when calculated.recursive_step = 1
        then 'legacy_unverified_d1'
      else 'legacy_unverified'
    end,
    true,
    'uncalibrated_persistence_spread',
    v_now
  from calculated;

  get diagnostics v_count = row_count;

  delete from public.forecast_hourly
  where model_name = v_model
    and (forecast_at at time zone 'Asia/Bangkok')::date = v_bangkok_today;

  with anchor as (
    select distinct on (summary.province_id)
      summary.province_id,
      summary.date as source_date,
      summary.pm25_mean as last_value,
      coalesce(summary.pm25_roll7, summary.pm25_mean) as roll7
    from public.training_daily_summary_v2 as summary
    where summary.pm25_mean is not null
    order by summary.province_id, summary.date desc
  ),
  hours as (
    select generate_series(1, 168) as hour_ahead
  ),
  calculated as (
    select
      anchor.*,
      hours.hour_ahead,
      date_trunc('hour', v_now)
        + hours.hour_ahead * interval '1 hour' as target_time,
      greatest(
        1,
        (v_first_target - anchor.source_date)
          + ceil(hours.hour_ahead / 24.0)::integer - 1
      ) as recursive_step
    from anchor
    cross join hours
  )
  insert into public.forecast_hourly (
    province_id,
    forecast_at,
    target_time,
    pm25_forecast,
    model_name,
    created_at
  )
  select
    calculated.province_id,
    v_now,
    calculated.target_time,
    greatest(
      0,
      round((
        (
          calculated.last_value
          + (1 - power(0.85, calculated.recursive_step))
            * (calculated.roll7 - calculated.last_value)
        )
        * (
          1 + 0.18 * (
            exp(-(
              power(
                extract(
                  hour from (
                    calculated.target_time at time zone 'Asia/Bangkok'
                  )
                ) - 7,
                2
              )
            ) / 12.0)
            + 0.7 * exp(-(
              power(
                extract(
                  hour from (
                    calculated.target_time at time zone 'Asia/Bangkok'
                  )
                ) - 20,
                2
              )
            ) / 16.0)
          ) - 0.08
        )
      )::numeric, 1)
    ),
    v_model,
    v_now
  from calculated;

  return v_count;
end;
$$;

comment on function public.fn_generate_forecast(integer) is
  'Generates a future-only persistence fallback anchored on complete non-synthetic daily data. It does not train a model.';

insert into public.sync_state (
  job_name,
  source,
  schedule,
  status,
  records_processed,
  updated_at
)
values (
  'daily_pipeline',
  'internal',
  'daily_01_30_Asia_Bangkok',
  'idle',
  0,
  now()
)
on conflict (job_name) do update
set source = excluded.source,
    schedule = excluded.schedule,
    updated_at = now();

update public.sync_state
set source = 'offline_colab_or_github',
    schedule = 'manual_only',
    status = 'idle',
    next_run_at = null,
    error_msg = null,
    updated_at = now()
where job_name = 'model_retrain';

update public.sync_state
set schedule = 'daily_01_30_Asia_Bangkok',
    updated_at = now()
where job_name in ('daily_cleanup', 'forecast_generate');

create or replace function public.fn_daily_pipeline()
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'vault'
as $$
declare
  v_start timestamptz := clock_timestamp();
  v_max_observed_date date;
  v_date date;
  v_built integer := 0;
  v_forecast integer := 0;
  v_cleanup jsonb;
  v_result jsonb;
  v_ml_secret text;
  v_base_url text;
  v_ml_url text;
begin
  update public.sync_state
  set status = 'running',
      last_run_at = v_start,
      error_msg = null,
      updated_at = now()
  where job_name = 'daily_pipeline';

  select max(
    (observed_at at time zone 'Asia/Bangkok')::date
  )
  into v_max_observed_date
  from public.air_quality_hourly
  where pm25 is not null
    and lower(source) not in ('synthetic', 'mock', 'demo')
    and observed_at <= date_trunc('hour', now());

  if v_max_observed_date is null then
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

  for v_date in
    select generate_series(
      v_max_observed_date - 1,
      v_max_observed_date,
      interval '1 day'
    )::date
  loop
    v_built := v_built + public.fn_build_daily_summary(v_date);
  end loop;

  v_forecast := public.fn_generate_forecast(7);
  v_cleanup := public.fn_cleanup_old_data();

  begin
    select decrypted_secret
    into v_ml_secret
    from vault.decrypted_secrets
    where name = 'ml_secret'
    limit 1;

    select decrypted_secret
    into v_base_url
    from vault.decrypted_secrets
    where name = 'vercel_base_url'
    limit 1;

    v_base_url := coalesce(
      nullif(trim(v_base_url), ''),
      'https://northeastthailand-airquality.vercel.app'
    );
    v_ml_url := rtrim(v_base_url, '/') || '/api/cron/ml-forecast';

    if v_ml_secret is not null then
      perform net.http_post(
        url := v_ml_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_ml_secret
        ),
        body := '{}'::jsonb
      );
    end if;
  exception when others then
    v_ml_secret := null;
  end;

  v_result := jsonb_build_object(
    'status', 'success',
    'as_of', v_max_observed_date,
    'daily_rows_built', v_built,
    'fallback_forecast_rows', v_forecast,
    'cleanup', v_cleanup,
    'ml_inference_triggered', v_ml_secret is not null,
    'ml_url', v_ml_url,
    'training_performed', false,
    'duration_ms',
      extract(epoch from clock_timestamp() - v_start) * 1000
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
    v_start,
    clock_timestamp(),
    'success',
    (
      extract(epoch from clock_timestamp() - v_start) * 1000
    )::integer,
    v_built + v_forecast,
    v_result
  );

  update public.sync_state
  set status = 'success',
      last_run_at = v_start,
      last_success_at = now(),
      records_processed = v_built + v_forecast,
      duration_ms = (
        extract(epoch from clock_timestamp() - v_start) * 1000
      )::integer,
      error_msg = null,
      updated_at = now()
  where job_name = 'daily_pipeline';

  update public.sync_state
  set status = 'success',
      last_run_at = v_start,
      last_success_at = now(),
      records_processed = case
        when job_name = 'forecast_generate' then v_forecast
        else 0
      end,
      duration_ms = (
        extract(epoch from clock_timestamp() - v_start) * 1000
      )::integer,
      error_msg = null,
      updated_at = now()
  where job_name in ('daily_cleanup', 'forecast_generate');

  return v_result;
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
    v_start,
    clock_timestamp(),
    'error',
    sqlerrm
  );

  update public.sync_state
  set status = 'error',
      last_run_at = v_start,
      error_msg = sqlerrm,
      updated_at = now()
  where job_name in (
    'daily_pipeline',
    'daily_cleanup',
    'forecast_generate'
  );

  return jsonb_build_object('status', 'error', 'error', sqlerrm);
end;
$$;

comment on function public.fn_daily_pipeline() is
  'Builds summaries, creates a persistence fallback, cleans retention data, and triggers ML inference. It never trains or activates models.';

create or replace function public.fn_refresh_next_runs()
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_now timestamptz := now();
  v_hourly timestamptz;
  v_six_hour timestamptz;
  v_daily timestamptz;
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

  v_daily := date_trunc('day', v_now) + interval '18 hours 30 minutes';
  if v_daily <= v_now then
    v_daily := v_daily + interval '1 day';
  end if;

  update public.sync_state
  set next_run_at = v_hourly,
      updated_at = now()
  where job_name in ('pm25_sync', 'weather_sync');

  update public.sync_state
  set next_run_at = v_six_hour,
      updated_at = now()
  where job_name = 'hotspot_sync';

  update public.sync_state
  set next_run_at = v_daily,
      updated_at = now()
  where job_name in (
    'daily_pipeline',
    'daily_cleanup',
    'forecast_generate'
  );

  update public.sync_state
  set next_run_at = null,
      updated_at = now()
  where job_name = 'model_retrain';
end;
$$;
