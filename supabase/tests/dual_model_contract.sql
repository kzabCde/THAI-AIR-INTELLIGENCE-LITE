-- Run after applying the dual-model migration on development/staging.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'model_registry'
      and column_name = 'task_type'
  ) then
    raise exception 'model_registry.task_type is missing';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'uq_model_registry_one_active_per_task'
  ) then
    raise exception 'task-specific active-model index is missing';
  end if;

  if exists (
    select province_id, task_type
    from public.model_registry
    where is_active
    group by province_id, task_type
    having count(*) > 1
  ) then
    raise exception 'duplicate active model detected for a province/task';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'forecast_daily'
      and column_name = 'class_probabilities'
  ) then
    raise exception 'forecast_daily.class_probabilities is missing';
  end if;
end
$$;

explain (costs true, verbose false)
select model_name, run_id, metrics
from public.model_registry
where province_id = 'TH-30'
  and task_type = 'classification'
  and is_active;

explain (costs true, verbose false)
select target_date, pm25_mean_forecast, displayed_class
from public.forecast_daily
where province_id = 'TH-30'
order by target_date desc, forecast_at desc
limit 7;
