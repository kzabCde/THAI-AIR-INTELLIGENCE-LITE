-- Version 2 evaluates closed Bangkok calendar days, with equal hourly weights.
-- Legacy results remain auditable but are excluded from the new report until
-- explicitly recomputed. No observation, forecast or model is fabricated here.
alter table public.forecast_evaluations
  add column evaluation_version smallint not null default 1,
  add column evaluation_status text not null default 'legacy'
    check (evaluation_status in ('legacy', 'final', 'insufficient_data')),
  add column hours_available smallint check (hours_available between 0 and 24),
  add column reference_kind text check (reference_kind in
    ('model_reference', 'provider_reference', 'mixed_reference')),
  add column revision integer not null default 1;

create index if not exists idx_forecast_verification_report
  on public.forecast_daily (province_id, target_date, forecast_horizon_days, forecast_at desc)
  where forecast_run_id is not null;

-- Explicit bounded repair entry point, also used by the daily wrapper below.
create or replace function public.fn_evaluate_forecasts_range(
  p_start_date date, p_end_date date
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  updated_count integer;
  invalidated_count integer;
  today_th date := (now() at time zone 'Asia/Bangkok')::date;
begin
  if p_start_date is null or p_end_date is null
    or p_start_date > p_end_date or p_end_date - p_start_date > 89
    or p_end_date >= today_th then
    raise exception 'Expected 1-90 closed Bangkok calendar days';
  end if;

  -- Keep the full incoming source list, including mixed-provider days. A mixed
  -- day must never be presented as an independent ground-station measurement.
  with candidates as materialized (
    select f.* from public.forecast_daily f
    join public.forecast_runs r on r.run_id = f.forecast_run_id
    where f.target_date between p_start_date and p_end_date
      and f.forecast_at < f.target_date::timestamp at time zone 'Asia/Bangkok'
      and r.status in ('success', 'partial')
      and f.pm25_mean_forecast >= 0 and f.pm25_mean_forecast < 'Infinity'::numeric
  ), dates as materialized (
    select distinct province_id, target_date from candidates
  ), observations as materialized (
    select d.province_id, d.target_date, a.observed_at, a.pm25, lower(a.source) as source
    from dates d join public.air_quality_hourly a
      on a.province_id = d.province_id
      and a.observed_at >= d.target_date::timestamp at time zone 'Asia/Bangkok'
      and a.observed_at < (d.target_date + 1)::timestamp at time zone 'Asia/Bangkok'
    where a.observed_at >= p_start_date::timestamp at time zone 'Asia/Bangkok'
      and a.observed_at < (p_end_date + 1)::timestamp at time zone 'Asia/Bangkok'
      and a.pm25 >= 0 and a.pm25 < 'Infinity'::numeric
      and lower(a.source) in ('open-meteo', 'air4thai', 'openaq', 'waqi')
  ), hourly as materialized (
    select province_id, target_date, date_trunc('hour', observed_at) as hour,
      avg(pm25) as pm25
    from observations
    group by province_id, target_date, date_trunc('hour', observed_at)
  ), provenance as materialized (
    select province_id, target_date,
      string_agg(distinct source, ',' order by source) as source,
      count(distinct source) as source_count, max(observed_at) as observed_at
    from observations group by province_id, target_date
  ), daily as (
    select province_id, target_date, avg(pm25) as pm25, count(*) as hours
    from hourly group by province_id, target_date having count(*) >= 18
  ), scored as (
    select f.*, d.pm25 as actual, d.hours, p.source, p.observed_at,
      case when p.source_count > 1 then 'mixed_reference'
        when p.source = 'open-meteo' then 'model_reference'
        else 'provider_reference' end as kind,
      case when d.pm25 <= 15 then 1 when d.pm25 <= 25 then 2
        when d.pm25 <= 37.5 then 3 when d.pm25 <= 75 then 4 else 5 end as actual_class
    from candidates f join daily d using (province_id, target_date)
    join provenance p using (province_id, target_date)
  )
  insert into public.forecast_evaluations as existing (
    forecast_daily_id, actual_pm25, actual_class, actual_source, actual_observed_at,
    absolute_error, squared_error, interval_covered, class_correct, evaluated_at,
    evaluation_version, evaluation_status, hours_available, reference_kind
  ) select id, actual, actual_class, source, observed_at,
    abs(actual - pm25_mean_forecast), power(actual - pm25_mean_forecast, 2),
    case when pm25_p10_forecast is null or pm25_p90_forecast is null then null
      else actual between pm25_p10_forecast and pm25_p90_forecast end,
    displayed_class = actual_class, now(), 2, 'final', hours, kind
  from scored
  on conflict (forecast_daily_id) do update set
    actual_pm25 = excluded.actual_pm25, actual_class = excluded.actual_class,
    actual_source = excluded.actual_source, actual_observed_at = excluded.actual_observed_at,
    absolute_error = excluded.absolute_error, squared_error = excluded.squared_error,
    interval_covered = excluded.interval_covered, class_correct = excluded.class_correct,
    evaluated_at = excluded.evaluated_at, evaluation_version = 2,
    evaluation_status = 'final', hours_available = excluded.hours_available,
    reference_kind = excluded.reference_kind, revision = existing.revision + 1
  where (existing.actual_pm25, existing.actual_source, existing.actual_observed_at,
    existing.hours_available, existing.evaluation_version, existing.evaluation_status,
    existing.absolute_error, existing.squared_error, existing.class_correct, existing.interval_covered)
    is distinct from
    (excluded.actual_pm25, excluded.actual_source, excluded.actual_observed_at,
    excluded.hours_available, 2::smallint, 'final'::text,
    excluded.absolute_error, excluded.squared_error, excluded.class_correct, excluded.interval_covered);
  get diagnostics updated_count = row_count;

  -- If data is withdrawn/corrected below the coverage gate, retain the previous
  -- numeric result for audit but remove it from every v2 score immediately.
  with coverage as materialized (
    select f.id, count(distinct date_trunc('hour', a.observed_at))::smallint as hours
    from public.forecast_daily f
    join public.forecast_evaluations e on e.forecast_daily_id = f.id
    left join public.air_quality_hourly a on a.province_id = f.province_id
      and a.observed_at >= f.target_date::timestamp at time zone 'Asia/Bangkok'
      and a.observed_at < (f.target_date + 1)::timestamp at time zone 'Asia/Bangkok'
      and a.observed_at >= p_start_date::timestamp at time zone 'Asia/Bangkok'
      and a.observed_at < (p_end_date + 1)::timestamp at time zone 'Asia/Bangkok'
      and a.pm25 >= 0 and a.pm25 < 'Infinity'::numeric
      and lower(a.source) in ('open-meteo', 'air4thai', 'openaq', 'waqi')
    where f.target_date between p_start_date and p_end_date
      and e.evaluation_status in ('final', 'insufficient_data')
    group by f.id
    having count(distinct date_trunc('hour', a.observed_at)) < 18
  )
  update public.forecast_evaluations e set evaluation_status = 'insufficient_data',
    hours_available = c.hours, evaluated_at = now(), revision = revision + 1
  from coverage c where c.id = e.forecast_daily_id
    and (e.evaluation_status, e.hours_available) is distinct from ('insufficient_data'::text, c.hours);
  get diagnostics invalidated_count = row_count;
  return jsonb_build_object('evaluated', updated_count, 'invalidated', invalidated_count,
    'version', 2, 'from', p_start_date, 'to', p_end_date);
end;
$$;

create or replace function public.fn_evaluate_due_forecasts()
returns jsonb language sql security invoker set search_path = '' as $$
  select public.fn_evaluate_forecasts_range(
    (now() at time zone 'Asia/Bangkok')::date - 7,
    (now() at time zone 'Asia/Bangkok')::date - 1);
$$;

-- Select the latest published issue for each date/horizon BEFORE joining scores:
-- no cherry-picking the most accurate run or giving repeated runs extra weight.
create or replace function public.fn_get_forecast_verification(
  p_province text, p_days integer default 30, p_horizon integer default 1
)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  today_th date := (now() at time zone 'Asia/Bangkok')::date;
  result jsonb;
begin
  if p_days is null or p_days not in (7, 30, 90)
    or p_horizon is null or p_horizon not between 1 and 7
    or p_province is null or not exists (
      select 1 from public.isan_provinces where province_id = p_province
    ) then raise exception 'Invalid forecast verification filters'; end if;
  with selected as (
    select distinct on (f.target_date, f.forecast_horizon_days) f.*
    from public.forecast_daily f
    join public.forecast_runs r on r.run_id = f.forecast_run_id
    where f.province_id = p_province and f.forecast_horizon_days = p_horizon
      and f.target_date between today_th - p_days and today_th + 7
      and f.forecast_at < f.target_date::timestamp at time zone 'Asia/Bangkok'
      and r.status in ('success', 'partial')
    order by f.target_date, f.forecast_horizon_days, f.forecast_at desc, f.id desc
  ), report as (
    select f.id, f.target_date, f.forecast_at, f.forecast_horizon_days,
      f.pm25_mean_forecast as predicted, f.regression_model_name as model_name,
      f.regression_run_id as model_run_id, f.classifier_model_name,
      f.classifier_run_id, f.classifier_predicted_class, f.regression_derived_class,
      f.displayed_class, f.classification_source,
      case when f.target_date >= today_th then 'pending'
        when e.evaluation_version = 2 and e.evaluation_status = 'final' then 'final'
        when e.evaluation_status = 'legacy' then 'legacy'
        else 'insufficient_data' end as status,
      case when e.evaluation_version = 2 and e.evaluation_status = 'final'
        and f.target_date < today_th then e.actual_pm25 end as actual,
      e.actual_class, e.actual_source, e.reference_kind, e.hours_available,
      e.evaluated_at, e.revision, e.interval_covered
    from selected f left join public.forecast_evaluations e on e.forecast_daily_id = f.id
  ) select coalesce(jsonb_agg(to_jsonb(report) order by target_date), '[]'::jsonb)
    into result from report;
  return jsonb_build_object('province', p_province, 'days', p_days, 'horizon', p_horizon,
    'from', today_th - p_days, 'to', today_th - 1, 'today', today_th,
    'timezone', 'Asia/Bangkok', 'minimumHours', 18, 'rows', result);
end;
$$;

revoke all on function public.fn_evaluate_forecasts_range(date,date) from public, anon, authenticated;
revoke all on function public.fn_evaluate_due_forecasts() from public, anon, authenticated;
revoke all on function public.fn_get_forecast_verification(text,integer,integer) from public, anon, authenticated;
grant execute on function public.fn_evaluate_forecasts_range(date,date) to service_role;
grant execute on function public.fn_evaluate_due_forecasts() to service_role;
grant execute on function public.fn_get_forecast_verification(text,integer,integer) to service_role;

-- Existing drift storage has no reference-source dimension. Keep this internal
-- series explicitly model-reference-only; the new report groups other sources.
create or replace function public.fn_refresh_model_drift_metrics()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  upserted_count integer;
begin
  with published as (
    select distinct on (f.province_id, f.target_date, f.forecast_horizon_days) f.*
    from public.forecast_daily f join public.forecast_runs r on r.run_id = f.forecast_run_id
    where f.target_date >= (now() at time zone 'Asia/Bangkok')::date - 30
      and f.target_date < (now() at time zone 'Asia/Bangkok')::date
      and f.forecast_at < f.target_date::timestamp at time zone 'Asia/Bangkok'
      and r.status in ('success', 'partial')
    order by f.province_id, f.target_date, f.forecast_horizon_days, f.forecast_at desc, f.id desc
  )
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
      'window_days', 30, 'evaluation_version', 2, 'actual_source', 'open-meteo'
    )
  from public.forecast_evaluations as evaluation
  join published as forecast
    on forecast.id = evaluation.forecast_daily_id
  join public.model_registry as registry
    on registry.province_id = forecast.province_id
   and registry.task_type = 'regression'
   and registry.model_name = forecast.regression_model_name
   and registry.run_id = forecast.regression_run_id
  where evaluation.evaluation_version = 2
    and evaluation.evaluation_status = 'final'
    and evaluation.actual_source = 'open-meteo'
    and forecast.forecast_horizon_days between 1 and 7
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
revoke all on function public.fn_refresh_model_drift_metrics() from public, anon, authenticated;
grant execute on function public.fn_refresh_model_drift_metrics() to service_role;
