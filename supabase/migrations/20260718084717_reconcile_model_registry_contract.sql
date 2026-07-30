-- Reconcile the model registry after the v2 rollout and restore the last
-- complete per-province model selection. This migration is forward-only.

alter table public.model_registry
  alter column run_id set default gen_random_uuid();

alter table public.model_registry
  add column if not exists data_cutoff date,
  add column if not exists train_start date,
  add column if not exists train_end date,
  add column if not exists test_start date,
  add column if not exists test_end date,
  add column if not exists source text;

create or replace function public.fn_upsert_model_registry(rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb;
  upserted integer := 0;
begin
  if jsonb_typeof(rows) <> 'array' then
    raise exception 'rows must be a JSON array';
  end if;

  for r in select * from jsonb_array_elements(rows)
  loop
    insert into public.model_registry (
      model_name,
      province_id,
      run_id,
      trained_at,
      training_rows,
      mae,
      rmse,
      r2,
      is_active,
      model_params,
      data_cutoff,
      train_start,
      train_end,
      test_start,
      test_end,
      source
    )
    values (
      r->>'model_name',
      r->>'province_id',
      coalesce(nullif(r->>'run_id', '')::uuid, gen_random_uuid()),
      coalesce(nullif(r->>'trained_at', '')::timestamptz, now()),
      nullif(r->>'training_rows', '')::integer,
      nullif(r->>'mae', '')::numeric,
      nullif(r->>'rmse', '')::numeric,
      nullif(r->>'r2', '')::numeric,
      false,
      coalesce(r->'model_params', '{}'::jsonb),
      nullif(coalesce(r->>'data_cutoff', r#>>'{model_params,data_cutoff}'), '')::date,
      nullif(coalesce(r->>'train_start', r#>>'{model_params,train_start}'), '')::date,
      nullif(coalesce(r->>'train_end', r#>>'{model_params,train_end}'), '')::date,
      nullif(coalesce(r->>'test_start', r#>>'{model_params,test_start}'), '')::date,
      nullif(coalesce(r->>'test_end', r#>>'{model_params,test_end}'), '')::date,
      coalesce(r->>'source', r#>>'{model_params,source_view}')
    )
    on conflict (model_name, province_id, run_id) do update set
      trained_at = excluded.trained_at,
      training_rows = excluded.training_rows,
      mae = excluded.mae,
      rmse = excluded.rmse,
      r2 = excluded.r2,
      is_active = false,
      model_params = excluded.model_params,
      data_cutoff = excluded.data_cutoff,
      train_start = excluded.train_start,
      train_end = excluded.train_end,
      test_start = excluded.test_start,
      test_end = excluded.test_end,
      source = excluded.source;

    upserted := upserted + 1;
  end loop;

  return jsonb_build_object('upserted', upserted, 'activated', 0);
end;
$$;

create or replace function public.fn_activate_model(
  p_province_id varchar,
  p_model_name varchar,
  p_run_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate public.model_registry%rowtype;
begin
  perform 1
  from public.isan_provinces
  where province_id = p_province_id
  for update;

  if not found then
    raise exception 'unknown province %', p_province_id;
  end if;

  select *
  into candidate
  from public.model_registry
  where province_id = p_province_id
    and model_name = p_model_name
    and (p_run_id is null or run_id = p_run_id)
  order by trained_at desc, id desc
  limit 1
  for update;

  if not found then
    raise exception 'model candidate not found for province %', p_province_id;
  end if;

  if candidate.mae is null
    or candidate.rmse is null
    or candidate.r2 is null
    or (
      p_model_name <> 'persist-revert-v2'
      and not (
        (p_model_name in ('surrogate-v2', 'stacking-v2') and candidate.model_params ? 'surrogate')
        or (p_model_name in ('xgboost-v1', 'lightgbm-v1') and candidate.model_params ? 'feature_importance')
        or (p_model_name = 'stacking-v1' and candidate.model_params ? 'w_ml' and candidate.model_params ? 'w_persist')
      )
    )
  then
    raise exception 'candidate is missing validated metrics or a compatible runtime artifact';
  end if;

  update public.model_registry
  set is_active = false
  where province_id = p_province_id
    and is_active;

  update public.model_registry
  set is_active = true
  where id = candidate.id;

  return jsonb_build_object(
    'province_id', p_province_id,
    'model_name', p_model_name,
    'run_id', candidate.run_id,
    'activated', true
  );
end;
$$;

revoke all on function public.fn_upsert_model_registry(jsonb) from public, anon, authenticated;
revoke all on function public.fn_activate_model(varchar, varchar, uuid) from public, anon, authenticated;
grant execute on function public.fn_upsert_model_registry(jsonb) to service_role;
grant execute on function public.fn_activate_model(varchar, varchar, uuid) to service_role;

-- The earlier v2 safety migration reset all provinces to persistence. Restore
-- the last complete ML forecast selection only when all 20 provinces resolve
-- to a compatible candidate; otherwise abort without changing active models.
do $$
declare
  selected_count integer;
begin
  create temporary table model_selection_recovery on commit drop as
  with batch as (
    select forecast_at
    from public.forecast_daily
    group by forecast_at
    having count(distinct province_id) = 20
       and count(distinct model_name) > 1
    order by forecast_at desc
    limit 1
  ), selection as (
    select distinct on (forecast.province_id)
      forecast.province_id,
      forecast.model_name
    from public.forecast_daily as forecast
    join batch on batch.forecast_at = forecast.forecast_at
    order by forecast.province_id, forecast.target_date
  )
  select distinct on (selection.province_id)
    registry.id,
    selection.province_id,
    selection.model_name
  from selection
  join public.model_registry as registry
    on registry.province_id = selection.province_id
   and registry.model_name = selection.model_name
  order by selection.province_id, registry.trained_at desc, registry.id desc;

  select count(*) into selected_count from model_selection_recovery;
  if selected_count <> 20 then
    raise exception 'model recovery expected 20 candidates, found %', selected_count;
  end if;

  update public.model_registry
  set is_active = false
  where province_id is not null;

  update public.model_registry as registry
  set is_active = true
  from model_selection_recovery as recovery
  where registry.id = recovery.id;
end;
$$;

comment on function public.fn_upsert_model_registry(jsonb) is
  'Registers versioned inactive model candidates; accepts legacy payloads without run_id.';
comment on function public.fn_activate_model(varchar, varchar, uuid) is
  'Atomically activates one validated v1 or v2 runtime-compatible model per province.';
