-- Evaluate only due, auditable forecast rows and aggregate only the observed
-- province/date pairs that are still missing an evaluation.

create or replace function public.fn_evaluate_due_forecasts()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  evaluated_count integer;
begin
  with candidates as materialized (
    select
      forecast.id,
      forecast.province_id,
      forecast.target_date,
      forecast.pm25_mean_forecast,
      forecast.pm25_p10_forecast,
      forecast.pm25_p90_forecast,
      forecast.displayed_class
    from public.forecast_daily as forecast
    where forecast.forecast_run_id is not null
      and forecast.target_date
        <= (now() at time zone 'Asia/Bangkok')::date
      and not exists (
        select 1
        from public.forecast_evaluations as existing
        where existing.forecast_daily_id = forecast.id
      )
  ),
  candidate_dates as materialized (
    select distinct
      candidate.province_id,
      candidate.target_date
    from candidates as candidate
  ),
  observed as materialized (
    select
      candidate.province_id,
      candidate.target_date,
      avg(air.pm25)::numeric as pm25_mean,
      array_agg(distinct air.source order by air.source) as trusted_sources,
      max(air.observed_at) as trusted_observed_at
    from candidate_dates as candidate
    join public.air_quality_hourly as air
      on air.province_id = candidate.province_id
     and air.observed_at >= (
       candidate.target_date::timestamp
       at time zone 'Asia/Bangkok'
     )
     and air.observed_at < (
       (candidate.target_date + 1)::timestamp
       at time zone 'Asia/Bangkok'
     )
    where air.pm25 is not null
      and air.observed_at <= date_trunc('hour', now())
      and lower(air.source) not in ('synthetic', 'mock', 'demo')
    group by
      candidate.province_id,
      candidate.target_date
    having count(distinct date_trunc(
      'hour',
      air.observed_at at time zone 'Asia/Bangkok'
    )) >= 18
  )
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
      'trusted_air_quality_hourly'
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
  from candidates as forecast
  join observed
    on observed.province_id = forecast.province_id
   and observed.target_date = forecast.target_date
  on conflict (forecast_daily_id) do nothing;

  get diagnostics evaluated_count = row_count;
  return jsonb_build_object('evaluated', evaluated_count);
end;
$$;

revoke all on function public.fn_evaluate_due_forecasts()
  from public, anon, authenticated;
grant execute on function public.fn_evaluate_due_forecasts()
  to service_role;
