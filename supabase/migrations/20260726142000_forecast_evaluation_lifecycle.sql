-- Connect each forecast batch to an auditable run and evaluate due forecasts.

alter table public.forecast_daily
  add column if not exists forecast_run_id uuid
    references public.forecast_runs(run_id) on delete set null;

create index if not exists idx_forecast_daily_run_id
  on public.forecast_daily (forecast_run_id)
  where forecast_run_id is not null;

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
    (
      observed.date::timestamp + time '23:59:59'
    ) at time zone 'Asia/Bangkok',
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
  where observed.pm25_mean is not null
  on conflict (forecast_daily_id) do update set
    actual_pm25 = excluded.actual_pm25,
    actual_class = excluded.actual_class,
    actual_source = excluded.actual_source,
    actual_observed_at = excluded.actual_observed_at,
    absolute_error = excluded.absolute_error,
    squared_error = excluded.squared_error,
    interval_covered = excluded.interval_covered,
    class_correct = excluded.class_correct,
    evaluated_at = excluded.evaluated_at;

  get diagnostics evaluated_count = row_count;
  return jsonb_build_object('evaluated', evaluated_count);
end;
$$;

revoke all on function public.fn_evaluate_due_forecasts()
  from public, anon, authenticated;
grant execute on function public.fn_evaluate_due_forecasts()
  to service_role;
