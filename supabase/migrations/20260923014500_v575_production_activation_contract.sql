-- v5.7.5 production activation contract.
--
-- Adds a service-role-only, atomic per-province activation plan with:
--   * preflight validation before any model_registry write,
--   * activate / hold / deactivate actions,
--   * audit snapshots,
--   * exact rollback to the previously active registry ids.
--
-- The contract intentionally permits zero active classifiers so serving can
-- fall back to the regression-derived PM2.5 class.

set lock_timeout = '5s';
set statement_timeout = '90s';

create table if not exists public.model_activation_audit (
  activation_id uuid primary key default gen_random_uuid(),
  candidate_run_id uuid not null,
  contract_version text not null,
  status text not null default 'applied'
    check (status in ('applied', 'rolled_back')),
  plan jsonb not null,
  preflight jsonb not null,
  before_state jsonb not null,
  after_state jsonb not null,
  rollback_state jsonb,
  created_at timestamptz not null default now(),
  applied_at timestamptz not null default now(),
  rolled_back_at timestamptz
);

create index if not exists idx_model_activation_audit_run
  on public.model_activation_audit (candidate_run_id, created_at desc);

alter table public.model_activation_audit enable row level security;

revoke all on table public.model_activation_audit
  from public, anon, authenticated;
grant select on table public.model_activation_audit to service_role;

create or replace function public.fn_preflight_daily_model_activation(
  p_run_id uuid,
  p_plan jsonb,
  p_required_provinces integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  province text;
  task text;
  action text;
  requested_model text;
  candidate public.model_registry%rowtype;
  evidence_metrics jsonb;
  portable_runtime boolean;
  plan_rows integer;
  distinct_pairs integer;
  distinct_provinces integer;
  active_count integer;
  activate_count integer := 0;
  hold_count integer := 0;
  deactivate_count integer := 0;
begin
  if p_run_id is null then
    raise exception 'p_run_id is required';
  end if;
  if p_required_provinces < 1 then
    raise exception 'p_required_provinces must be positive';
  end if;
  if jsonb_typeof(p_plan) <> 'array' then
    raise exception 'p_plan must be a JSON array';
  end if;

  with parsed as (
    select
      value->>'province_id' as province_id,
      value->>'task_type' as task_type
    from jsonb_array_elements(p_plan)
  )
  select
    count(*),
    count(distinct (province_id, task_type)),
    count(distinct province_id)
  into plan_rows, distinct_pairs, distinct_provinces
  from parsed;

  if plan_rows <> p_required_provinces * 2 then
    raise exception 'activation plan must contain exactly % task actions; found %',
      p_required_provinces * 2, plan_rows;
  end if;
  if distinct_pairs <> plan_rows then
    raise exception 'activation plan contains duplicate province/task actions';
  end if;
  if distinct_provinces <> p_required_provinces then
    raise exception 'activation plan must contain exactly % provinces; found %',
      p_required_provinces, distinct_provinces;
  end if;

  if exists (
    with parsed as (
      select value->>'province_id' as province_id
      from jsonb_array_elements(p_plan)
    )
    select 1
    from parsed
    left join public.isan_provinces province
      on province.province_id = parsed.province_id
    where province.province_id is null
  ) then
    raise exception 'activation plan contains an unknown province';
  end if;

  if exists (
    with parsed as (
      select
        value->>'province_id' as province_id,
        value->>'task_type' as task_type
      from jsonb_array_elements(p_plan)
    )
    select 1
    from (
      select province_id
      from parsed
      group by province_id
      having count(*) <> 2
         or count(*) filter (where task_type = 'regression') <> 1
         or count(*) filter (where task_type = 'classification') <> 1
    ) invalid
  ) then
    raise exception 'each province must have exactly one regression and one classification action';
  end if;

  for item in select value from jsonb_array_elements(p_plan)
  loop
    province := nullif(item->>'province_id', '');
    task := nullif(item->>'task_type', '');
    action := nullif(item->>'action', '');
    requested_model := nullif(item->>'model_name', '');

    if task is null or task not in ('regression', 'classification') then
      raise exception 'unsupported task type % for province %', task, province;
    end if;
    if action is null then
      raise exception 'activation action is required for province %, task %', province, task;
    end if;

    if task = 'regression'
       and action not in ('activate_candidate', 'hold_previous', 'deactivate_to_fallback')
    then
      raise exception 'unsupported regression action % for province %', action, province;
    end if;
    if task = 'classification'
       and action not in ('activate_candidate', 'hold_previous', 'deactivate_to_regression_threshold')
    then
      raise exception 'unsupported classification action % for province %', action, province;
    end if;

    if action = 'hold_previous' then
      select count(*)
      into active_count
      from public.model_registry
      where province_id = province
        and task_type = task
        and is_active;

      if active_count <> 1 then
        raise exception 'hold_previous requires exactly one active % model for %; found %',
          task, province, active_count;
      end if;
      hold_count := hold_count + 1;
      continue;
    end if;

    if action in ('deactivate_to_fallback', 'deactivate_to_regression_threshold') then
      deactivate_count := deactivate_count + 1;
      continue;
    end if;

    if requested_model is null then
      select count(*)
      into active_count
      from public.model_registry
      where run_id = p_run_id
        and province_id = province
        and task_type = task;
      if active_count <> 1 then
        raise exception 'activate_candidate requires one candidate for run %, province %, task %; found %',
          p_run_id, province, task, active_count;
      end if;

      select *
      into candidate
      from public.model_registry
      where run_id = p_run_id
        and province_id = province
        and task_type = task
      order by trained_at desc, id desc
      limit 1;
    else
      select *
      into candidate
      from public.model_registry
      where run_id = p_run_id
        and province_id = province
        and task_type = task
        and model_name = requested_model
      order by trained_at desc, id desc
      limit 1;
    end if;

    if not found then
      raise exception 'candidate not found for run %, province %, task %, model %',
        p_run_id, province, task, coalesce(requested_model, '<auto>');
    end if;

    if not candidate.eligibility_status then
      raise exception 'candidate is ineligible for %, %: %',
        province, task, coalesce(candidate.eligibility_reason, 'unspecified');
    end if;

    if candidate.feature_schema is null
       or jsonb_typeof(candidate.feature_schema) <> 'object'
       or not (candidate.feature_schema ? 'columns')
       or jsonb_typeof(candidate.feature_schema->'columns') <> 'array'
       or jsonb_array_length(candidate.feature_schema->'columns') = 0
    then
      raise exception 'candidate feature schema is missing or invalid for %, %',
        province, task;
    end if;

    portable_runtime :=
      candidate.runtime_artifact_uri like 'storage://model-artifacts/%'
      and candidate.runtime_artifact_sha256 ~ '^[0-9a-f]{64}$'
      and candidate.runtime_artifact_byte_size > 0
      and candidate.runtime_artifact_format = 'json+gzip'
      and exists (
        select 1
        from public.model_artifacts artifact
        where artifact.model_registry_id = candidate.id
          and artifact.artifact_kind = 'serving_portable'
          and artifact.storage_uri = candidate.runtime_artifact_uri
          and artifact.sha256 = candidate.runtime_artifact_sha256
      );

    if task = 'regression'
       and candidate.model_name <> 'persist-revert-v2'
       and not (candidate.model_params ? 'surrogate')
       and not coalesce(portable_runtime, false)
    then
      raise exception 'regression candidate lacks a compatible runtime artifact for %',
        province;
    end if;

    if task = 'classification'
       and not (candidate.model_params ? 'portable_classifier')
       and not coalesce(portable_runtime, false)
    then
      raise exception 'classification candidate lacks a compatible runtime artifact for %',
        province;
    end if;

    if task = 'classification' then
      evidence_metrics := case
        when coalesce((candidate.model_params->>'pooled_model')::boolean, false)
          then coalesce(candidate.model_params->'global_test_metrics', candidate.metrics)
        else candidate.metrics
      end;
      if candidate.evidence_status <> 'validated'
         or coalesce(
              nullif(evidence_metrics #>> '{per_class,4,support}', '')::integer,
              0
            ) < 5
         or coalesce(
              nullif(evidence_metrics #>> '{per_class,5,support}', '')::integer,
              0
            ) < 5
         or coalesce(
              evidence_metrics->'metric_class_contract',
              '[]'::jsonb
            ) <> '[1,2,3,4,5]'::jsonb
      then
        raise exception 'classification candidate lacks validated five-class evidence for %',
          province;
      end if;
    end if;

    activate_count := activate_count + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'run_id', p_run_id,
    'required_provinces', p_required_provinces,
    'plan_rows', plan_rows,
    'activate_count', activate_count,
    'hold_count', hold_count,
    'deactivate_count', deactivate_count,
    'preflight_only', true
  );
end;
$$;

comment on function public.fn_preflight_daily_model_activation(uuid, jsonb, integer) is
  'Validates the complete v5.7.5 per-province activation plan without changing active model state.';

revoke all on function public.fn_preflight_daily_model_activation(uuid, jsonb, integer)
  from public, anon, authenticated;
grant execute on function public.fn_preflight_daily_model_activation(uuid, jsonb, integer)
  to service_role;

create or replace function public.fn_apply_daily_model_activation(
  p_run_id uuid,
  p_plan jsonb,
  p_required_provinces integer default 20,
  p_contract_version text default 'v5.7.5-production-activation-v1'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  province text;
  task text;
  action text;
  requested_model text;
  preflight_result jsonb;
  before_state jsonb;
  after_state jsonb;
  before_active_id bigint;
  current_active_id bigint;
  active_count integer;
  activation_id uuid := gen_random_uuid();
  activate_count integer := 0;
  hold_count integer := 0;
  deactivate_count integer := 0;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('v575-daily-model-activation')
  );

  preflight_result := public.fn_preflight_daily_model_activation(
    p_run_id,
    p_plan,
    p_required_provinces
  );

  with parsed as (
    select
      value->>'province_id' as province_id,
      value->>'task_type' as task_type
    from jsonb_array_elements(p_plan)
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'province_id', parsed.province_id,
        'task_type', parsed.task_type,
        'active_registry_id', registry.id,
        'model_name', registry.model_name,
        'run_id', registry.run_id,
        'activated_at', registry.activated_at
      )
      order by parsed.province_id, parsed.task_type
    ),
    '[]'::jsonb
  )
  into before_state
  from parsed
  left join public.model_registry registry
    on registry.province_id = parsed.province_id
   and registry.task_type = parsed.task_type
   and registry.is_active;

  for item in select value from jsonb_array_elements(p_plan)
  loop
    province := item->>'province_id';
    task := item->>'task_type';
    action := item->>'action';
    requested_model := nullif(item->>'model_name', '');

    if action = 'activate_candidate' then
      if requested_model is null then
        select model_name
        into requested_model
        from public.model_registry
        where run_id = p_run_id
          and province_id = province
          and task_type = task
        order by trained_at desc, id desc
        limit 1;
      end if;

      perform public.fn_activate_model_task(
        province,
        task,
        requested_model,
        p_run_id,
        false
      );
      activate_count := activate_count + 1;
    elsif action = 'hold_previous' then
      hold_count := hold_count + 1;
    elsif action in ('deactivate_to_fallback', 'deactivate_to_regression_threshold') then
      update public.model_registry
      set is_active = false,
          activated_at = null
      where province_id = province
        and task_type = task
        and is_active;
      deactivate_count := deactivate_count + 1;
    else
      raise exception 'unsupported activation action %', action;
    end if;
  end loop;

  -- Postcondition readback. Any mismatch raises and rolls back the whole
  -- transaction, including all nested fn_activate_model_task calls.
  for item in select value from jsonb_array_elements(p_plan)
  loop
    province := item->>'province_id';
    task := item->>'task_type';
    action := item->>'action';
    requested_model := nullif(item->>'model_name', '');

    select count(*), max(id)
    into active_count, current_active_id
    from public.model_registry
    where province_id = province
      and task_type = task
      and is_active;

    if action = 'activate_candidate' then
      if active_count <> 1 then
        raise exception 'activation readback expected one active row for %, %; found %',
          province, task, active_count;
      end if;
      if not exists (
        select 1
        from public.model_registry
        where id = current_active_id
          and run_id = p_run_id
          and (requested_model is null or model_name = requested_model)
      ) then
        raise exception 'activation readback does not match candidate run for %, %',
          province, task;
      end if;
    elsif action = 'hold_previous' then
      select nullif(state->>'active_registry_id', '')::bigint
      into before_active_id
      from jsonb_array_elements(before_state) state
      where state->>'province_id' = province
        and state->>'task_type' = task;

      if active_count <> 1 or current_active_id is distinct from before_active_id then
        raise exception 'hold_previous changed active row for %, %', province, task;
      end if;
    else
      if active_count <> 0 then
        raise exception 'deactivation readback expected zero active rows for %, %; found %',
          province, task, active_count;
      end if;
    end if;
  end loop;

  with parsed as (
    select
      value->>'province_id' as province_id,
      value->>'task_type' as task_type
    from jsonb_array_elements(p_plan)
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'province_id', parsed.province_id,
        'task_type', parsed.task_type,
        'active_registry_id', registry.id,
        'model_name', registry.model_name,
        'run_id', registry.run_id,
        'activated_at', registry.activated_at
      )
      order by parsed.province_id, parsed.task_type
    ),
    '[]'::jsonb
  )
  into after_state
  from parsed
  left join public.model_registry registry
    on registry.province_id = parsed.province_id
   and registry.task_type = parsed.task_type
   and registry.is_active;

  insert into public.model_activation_audit (
    activation_id,
    candidate_run_id,
    contract_version,
    status,
    plan,
    preflight,
    before_state,
    after_state,
    created_at,
    applied_at
  )
  values (
    activation_id,
    p_run_id,
    coalesce(nullif(p_contract_version, ''), 'v5.7.5-production-activation-v1'),
    'applied',
    p_plan,
    preflight_result,
    before_state,
    after_state,
    now(),
    now()
  );

  return jsonb_build_object(
    'ok', true,
    'atomic', true,
    'activation_id', activation_id,
    'run_id', p_run_id,
    'contract_version', coalesce(nullif(p_contract_version, ''), 'v5.7.5-production-activation-v1'),
    'activate_count', activate_count,
    'hold_count', hold_count,
    'deactivate_count', deactivate_count,
    'before_state', before_state,
    'after_state', after_state
  );
end;
$$;

comment on function public.fn_apply_daily_model_activation(uuid, jsonb, integer, text) is
  'Atomically applies a preflighted per-province activate/hold/deactivate plan and records exact rollback state.';

revoke all on function public.fn_apply_daily_model_activation(uuid, jsonb, integer, text)
  from public, anon, authenticated;
grant execute on function public.fn_apply_daily_model_activation(uuid, jsonb, integer, text)
  to service_role;

create or replace function public.fn_rollback_daily_model_activation(
  p_activation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  audit_row public.model_activation_audit%rowtype;
  state jsonb;
  province text;
  task text;
  previous_id bigint;
  previous_activated_at timestamptz;
  restored_state jsonb;
  active_count integer;
  current_active_id bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('v575-daily-model-activation')
  );

  select *
  into audit_row
  from public.model_activation_audit
  where activation_id = p_activation_id
  for update;

  if not found then
    raise exception 'activation audit row not found: %', p_activation_id;
  end if;
  if audit_row.status <> 'applied' then
    raise exception 'activation % cannot be rolled back from status %',
      p_activation_id, audit_row.status;
  end if;

  -- Validate every historical row reference before changing current state.
  for state in select value from jsonb_array_elements(audit_row.before_state)
  loop
    previous_id := nullif(state->>'active_registry_id', '')::bigint;
    if previous_id is not null
       and not exists (
         select 1
         from public.model_registry
         where id = previous_id
           and province_id = state->>'province_id'
           and task_type = state->>'task_type'
       )
    then
      raise exception 'rollback source registry row % is missing', previous_id;
    end if;
  end loop;

  -- First clear all task pairs in the snapshot, then restore exact ids. This
  -- avoids violating the unique one-active-row-per-province/task index.
  for state in select value from jsonb_array_elements(audit_row.before_state)
  loop
    update public.model_registry
    set is_active = false,
        activated_at = null
    where province_id = state->>'province_id'
      and task_type = state->>'task_type'
      and is_active;
  end loop;

  for state in select value from jsonb_array_elements(audit_row.before_state)
  loop
    province := state->>'province_id';
    task := state->>'task_type';
    previous_id := nullif(state->>'active_registry_id', '')::bigint;
    previous_activated_at := nullif(state->>'activated_at', '')::timestamptz;

    if previous_id is not null then
      update public.model_registry
      set is_active = true,
          activated_at = previous_activated_at
      where id = previous_id;
    end if;
  end loop;

  -- Exact-id readback of the restored state.
  for state in select value from jsonb_array_elements(audit_row.before_state)
  loop
    province := state->>'province_id';
    task := state->>'task_type';
    previous_id := nullif(state->>'active_registry_id', '')::bigint;

    select count(*), max(id)
    into active_count, current_active_id
    from public.model_registry
    where province_id = province
      and task_type = task
      and is_active;

    if previous_id is null then
      if active_count <> 0 then
        raise exception 'rollback expected no active row for %, %; found %',
          province, task, active_count;
      end if;
    elsif active_count <> 1 or current_active_id is distinct from previous_id then
      raise exception 'rollback readback mismatch for %, %', province, task;
    end if;
  end loop;

  with parsed as (
    select
      value->>'province_id' as province_id,
      value->>'task_type' as task_type
    from jsonb_array_elements(audit_row.before_state)
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'province_id', parsed.province_id,
        'task_type', parsed.task_type,
        'active_registry_id', registry.id,
        'model_name', registry.model_name,
        'run_id', registry.run_id,
        'activated_at', registry.activated_at
      )
      order by parsed.province_id, parsed.task_type
    ),
    '[]'::jsonb
  )
  into restored_state
  from parsed
  left join public.model_registry registry
    on registry.province_id = parsed.province_id
   and registry.task_type = parsed.task_type
   and registry.is_active;

  update public.model_activation_audit
  set status = 'rolled_back',
      rollback_state = restored_state,
      rolled_back_at = now()
  where activation_id = p_activation_id;

  return jsonb_build_object(
    'ok', true,
    'atomic', true,
    'activation_id', p_activation_id,
    'candidate_run_id', audit_row.candidate_run_id,
    'status', 'rolled_back',
    'restored_state', restored_state
  );
end;
$$;

comment on function public.fn_rollback_daily_model_activation(uuid) is
  'Restores the exact active model_registry ids captured before a v5.7.5 activation transaction.';

revoke all on function public.fn_rollback_daily_model_activation(uuid)
  from public, anon, authenticated;
grant execute on function public.fn_rollback_daily_model_activation(uuid)
  to service_role;
