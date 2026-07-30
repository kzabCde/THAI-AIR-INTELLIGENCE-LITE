-- Repair the daily SQL forecast after versioned model candidates and the
-- one-active-model-per-province guard were introduced.
--
-- The legacy forecast function still tried to upsert persist-revert-v2 with
-- is_active=true before deactivating the selected model.  That now violates
-- uq_model_registry_one_active_per_province and aborts cleanup + forecasting.
-- Forecast generation must not change model selection; only
-- fn_activate_model() owns promotion.

alter table public.model_registry
  alter column model_name type varchar(64);

-- Remove the pre-versioning uniqueness rule.  Versioned candidates are
-- uniquely identified by (model_name, province_id, run_id).
alter table public.model_registry
  drop constraint if exists model_registry_model_province_key;
alter table public.model_registry
  drop constraint if exists model_registry_model_name_province_id_key;
drop index if exists public.model_registry_model_province_key;
drop index if exists public.model_registry_model_name_province_id_key;

create or replace function public.fn_generate_forecast(p_horizon integer default 7)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_asof  date;
  v_now   timestamptz := now();
  v_count integer := 0;
  v_model text := 'persist-revert-v2';
begin
  if p_horizon < 1 or p_horizon > 14 then
    raise exception 'p_horizon must be between 1 and 14';
  end if;

  select max(date) into v_asof from daily_summary;
  if v_asof is null then
    return 0;
  end if;

  -- Daily fallback forecast.  This is deliberately independent from the
  -- active model registry; the ML endpoint may replace the same horizon with
  -- the model selected through fn_activate_model().
  delete from forecast_daily
  where model_name = v_model
    and forecast_at::date = v_now::date;

  with anchor as (
    select
      province_id,
      pm25_mean as last_val,
      coalesce(pm25_roll7, pm25_mean) as roll7
    from daily_summary
    where date = v_asof
  ), horizon as (
    select generate_series(1, p_horizon) as h
  )
  insert into forecast_daily (
    province_id,
    forecast_at,
    target_date,
    pm25_mean_forecast,
    pm25_max_forecast,
    model_name,
    created_at
  )
  select
    anchor.province_id,
    v_now,
    v_asof + horizon.h,
    greatest(
      0,
      round((anchor.last_val + (1 - power(0.85, horizon.h)) *
        (anchor.roll7 - anchor.last_val))::numeric, 2)
    ),
    greatest(
      0,
      round(((anchor.last_val + (1 - power(0.85, horizon.h)) *
        (anchor.roll7 - anchor.last_val)) * 1.35)::numeric, 2)
    ),
    v_model,
    v_now
  from anchor
  cross join horizon;

  get diagnostics v_count = row_count;

  -- Hourly fallback forecast (168 hours), expanded with a diurnal curve.
  delete from forecast_hourly
  where model_name = v_model
    and forecast_at::date = v_now::date;

  with anchor as (
    select
      province_id,
      pm25_mean as last_val,
      coalesce(pm25_roll7, pm25_mean) as roll7
    from daily_summary
    where date = v_asof
  ), hours as (
    select generate_series(1, 168) as h
  )
  insert into forecast_hourly (
    province_id,
    forecast_at,
    target_time,
    pm25_forecast,
    model_name,
    created_at
  )
  select
    anchor.province_id,
    v_now,
    date_trunc('hour', v_now) + hours.h * interval '1 hour',
    greatest(
      0,
      round((
        (anchor.last_val + (1 - power(0.85, ceil(hours.h / 24.0))) *
          (anchor.roll7 - anchor.last_val))
        * (
          1 + 0.18 * (
            exp(-(power(extract(hour from (
              date_trunc('hour', v_now) + hours.h * interval '1 hour'
            )) - 7, 2)) / 12.0)
            + 0.7 * exp(-(power(extract(hour from (
              date_trunc('hour', v_now) + hours.h * interval '1 hour'
            )) - 20, 2)) / 16.0)
          ) - 0.08
        )
      )::numeric, 1)
    ),
    v_model,
    v_now
  from anchor
  cross join hours;

  return v_count;
end;
$function$;

comment on function public.fn_generate_forecast(integer) is
  'Generates persistence fallback forecasts without mutating active model selection.';

revoke all on function public.fn_generate_forecast(integer)
  from public, anon, authenticated;
grant execute on function public.fn_generate_forecast(integer) to service_role;
