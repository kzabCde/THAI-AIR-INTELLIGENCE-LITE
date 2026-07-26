-- Run after applying 20260726130615_research_hardening_v4.sql.

do $$
declare
  required_table text;
  required_column text;
begin
  foreach required_table in array array[
    'stations',
    'station_observations',
    'region_membership',
    'feature_snapshots',
    'forecast_runs',
    'forecast_evaluations',
    'model_artifacts',
    'model_drift_metrics',
    'pipeline_alerts'
  ]
  loop
    if not exists (
      select 1
      from pg_class as c
      join pg_namespace as n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = required_table
        and c.relrowsecurity
    ) then
      raise exception 'missing RLS-protected table public.%', required_table;
    end if;
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = required_table
        and policyname = 'service role full access'
        and 'service_role' = any(roles)
    ) then
      raise exception 'missing service-role policy on public.%', required_table;
    end if;
  end loop;

  foreach required_column in array array[
    'pm25_p10_forecast',
    'pm25_p50_forecast',
    'pm25_p90_forecast',
    'horizon_reliability',
    'is_experimental',
    'uncertainty_method'
    ,'forecast_run_id'
  ]
  loop
    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'forecast_daily'
        and column_name = required_column
    ) then
      raise exception 'missing forecast_daily.%', required_column;
    end if;
  end loop;

  if exists (
    select 1
    from public.model_registry
    where is_active
      and task_type = 'classification'
      and (
        evidence_status <> 'validated'
        or coalesce(
          nullif(metrics #>> '{per_class,4,support}', '')::integer,
          0
        ) < 5
        or coalesce(
          nullif(metrics #>> '{per_class,5,support}', '')::integer,
          0
        ) < 5
        or coalesce(metrics->'metric_class_contract', '[]'::jsonb)
          <> '[1,2,3,4,5]'::jsonb
      )
  ) then
    raise exception 'unsupported classifier remains active';
  end if;

  if exists (
    select 1
    from public.forecast_daily
    where pm25_p10_forecast is not null
      and pm25_p50_forecast is not null
      and pm25_p90_forecast is not null
      and not (
        pm25_p10_forecast <= pm25_p50_forecast
        and pm25_p50_forecast <= pm25_p90_forecast
      )
  ) then
    raise exception 'unordered PM2.5 interval detected';
  end if;

  if has_function_privilege(
    'anon',
    'public.fn_record_pipeline_alert(text,text,text,text,jsonb)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.fn_resolve_pipeline_alert(text,text)',
    'execute'
  ) then
    raise exception 'pipeline alert RPC is executable by a browser role';
  end if;

  if has_function_privilege(
    'anon',
    'public.fn_evaluate_due_forecasts()',
    'execute'
  ) then
    raise exception 'forecast evaluation RPC is executable by anon';
  end if;
end
$$;

explain (costs true, verbose false)
select model_name, run_id, evidence_status
from public.model_registry
where province_id = 'TH-30'
  and task_type = 'classification'
  and is_active;

explain (costs true, verbose false)
select
  target_date,
  pm25_p10_forecast,
  pm25_p50_forecast,
  pm25_p90_forecast,
  horizon_reliability
from public.forecast_daily
where province_id = 'TH-30'
order by target_date desc, forecast_at desc
limit 7;

explain (costs true, verbose false)
select model_registry_id, window_end, mae, interval_coverage
from public.model_drift_metrics
where province_id = 'TH-30'
order by window_end desc
limit 12;
