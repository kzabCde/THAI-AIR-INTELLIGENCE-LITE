-- Allow the validated six-model trainer to promote its standardized runtime
-- surrogate without weakening the existing activation checks.

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
        (
          p_model_name in ('surrogate-v2', 'stacking-v2', 'ensemble6-pm25-v3')
          and candidate.model_params ? 'surrogate'
        )
        or (
          p_model_name in ('xgboost-v1', 'lightgbm-v1')
          and candidate.model_params ? 'feature_importance'
        )
        or (
          p_model_name = 'stacking-v1'
          and candidate.model_params ? 'w_ml'
          and candidate.model_params ? 'w_persist'
        )
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

revoke all on function public.fn_activate_model(varchar, varchar, uuid)
  from public, anon, authenticated;
grant execute on function public.fn_activate_model(varchar, varchar, uuid)
  to service_role;

comment on function public.fn_activate_model(varchar, varchar, uuid) is
  'Atomically activates one validated runtime-compatible model per province, including ensemble6-pm25-v3.';
