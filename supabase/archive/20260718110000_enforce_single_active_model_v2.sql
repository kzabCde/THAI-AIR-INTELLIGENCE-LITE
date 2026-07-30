-- Model pipeline v2 safety gates.
-- 1) expose only quality-gated, non-synthetic daily summaries to training/runtime
-- 2) register every newly trained model as an inactive candidate
-- 3) keep exactly one active model per province and activate transactionally

create or replace view public.training_daily_summary_v2
with (security_invoker = true)
as
with lineage as (
  select
    aq.province_id,
    (aq.observed_at at time zone 'Asia/Bangkok')::date as date,
    count(distinct date_trunc('hour', aq.observed_at at time zone 'Asia/Bangkok'))
      filter (
        where aq.pm25 is not null
          and lower(aq.source) not in ('synthetic', 'mock', 'demo')
      )::integer as trusted_hours,
    array_agg(distinct aq.source order by aq.source)
      filter (
        where aq.pm25 is not null
          and lower(aq.source) not in ('synthetic', 'mock', 'demo')
      ) as trusted_sources
  from public.air_quality_hourly as aq
  group by aq.province_id, (aq.observed_at at time zone 'Asia/Bangkok')::date
)
select
  ds.*,
  lineage.trusted_hours,
  lineage.trusted_sources
from public.daily_summary as ds
join lineage
  on lineage.province_id = ds.province_id
 and lineage.date = ds.date
where lineage.trusted_hours >= 18
  and coalesce(ds.hours_available, 0) >= 18;

revoke all on public.training_daily_summary_v2 from public, anon, authenticated;
grant select on public.training_daily_summary_v2 to service_role;

-- Preserve every training run instead of overwriting the currently active row.
alter table public.model_registry
  add column if not exists run_id uuid not null default gen_random_uuid();

alter table public.model_registry
  drop constraint if exists model_registry_model_name_province_id_key;

create unique index if not exists uq_model_registry_model_run
  on public.model_registry (model_name, province_id, run_id);

-- Preserve the currently selected model. If historical drift left duplicate
-- active rows, keep the newest one instead of resetting every province.
with ranked_active as (
  select
    id,
    row_number() over (
      partition by province_id
      order by trained_at desc, id desc
    ) as active_rank
  from public.model_registry
  where is_active
    and province_id is not null
)
update public.model_registry as registry
set is_active = false
from ranked_active
where registry.id = ranked_active.id
  and ranked_active.active_rank > 1;

create unique index if not exists uq_model_registry_one_active_per_province
  on public.model_registry (province_id)
  where is_active and province_id is not null;

-- Registration never promotes. Promotion must use fn_activate_model.
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
      model_params
    )
    values (
      r->>'model_name',
      r->>'province_id',
      coalesce(nullif(r->>'run_id', '')::uuid, gen_random_uuid()),
      (r->>'trained_at')::timestamptz,
      (r->>'training_rows')::integer,
      (r->>'mae')::numeric,
      (r->>'rmse')::numeric,
      (r->>'r2')::numeric,
      false,
      r->'model_params'
    )
    on conflict (model_name, province_id, run_id) do update set
      trained_at = excluded.trained_at,
      training_rows = excluded.training_rows,
      mae = excluded.mae,
      rmse = excluded.rmse,
      r2 = excluded.r2,
      is_active = false,
      model_params = excluded.model_params;

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
  -- Serialize promotions for the same province, even when candidates differ.
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
      p_model_name not in ('persist-revert-v2')
      and not (
        (p_model_name in ('surrogate-v2', 'stacking-v2') and candidate.model_params ? 'surrogate')
        or (p_model_name in ('xgboost-v1', 'lightgbm-v1') and candidate.model_params ? 'feature_importance')
        or (p_model_name = 'stacking-v1' and candidate.model_params ? 'w_ml' and candidate.model_params ? 'w_persist')
      )
    )
  then
    raise exception 'candidate is missing validated metrics or a surrogate artifact';
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

comment on view public.training_daily_summary_v2 is
  'Daily PM2.5 features with >=18 trusted, non-synthetic hourly observations in Asia/Bangkok.';
comment on function public.fn_activate_model(varchar, varchar, uuid) is
  'Atomically activates exactly one validated model for a province; service role only.';
