-- Allow checksum-addressed pooled portable tree artifacts to pass the
-- activation gates while preserving support for legacy surrogate artifacts.
-- This migration changes only activation functions; it does not activate or
-- deactivate any model by itself.

set lock_timeout = '5s';
set statement_timeout = '90s';

create or replace function public.fn_activate_model_task(
  p_province_id text,
  p_task_type text,
  p_model_name text,
  p_run_id uuid default null,
  p_allow_ineligible boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate public.model_registry%rowtype;
  portable_runtime boolean;
  evidence_metrics jsonb;
begin
  if p_task_type not in ('regression', 'classification') then
    raise exception 'unsupported model task type %', p_task_type;
  end if;

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
    and task_type = p_task_type
    and model_name = p_model_name
    and (p_run_id is null or run_id = p_run_id)
  order by trained_at desc, id desc
  limit 1
  for update;

  if not found then
    raise exception 'model candidate not found for province % and task %',
      p_province_id, p_task_type;
  end if;

  if not p_allow_ineligible and not candidate.eligibility_status then
    raise exception 'model candidate is ineligible: %',
      coalesce(candidate.eligibility_reason, 'unspecified');
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

  evidence_metrics := case
    when coalesce((candidate.model_params->>'pooled_model')::boolean, false)
      then coalesce(candidate.model_params->'global_test_metrics', candidate.metrics)
    else candidate.metrics
  end;

  if p_task_type = 'classification'
    and (
      candidate.evidence_status <> 'validated'
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
    )
  then
    raise exception 'classification candidate lacks validated five-class evidence';
  end if;

  if p_model_name <> 'persist-revert-v2'
    and (
      candidate.feature_schema is null
      or jsonb_typeof(candidate.feature_schema) <> 'object'
      or not (candidate.feature_schema ? 'columns')
      or jsonb_typeof(candidate.feature_schema->'columns') <> 'array'
      or jsonb_array_length(candidate.feature_schema->'columns') = 0
    )
  then
    raise exception 'candidate feature schema is missing or invalid';
  end if;

  if p_task_type = 'regression'
    and p_model_name <> 'persist-revert-v2'
    and not (candidate.model_params ? 'surrogate')
    and not coalesce(portable_runtime, false)
  then
    raise exception 'regression candidate is missing a compatible runtime artifact';
  end if;

  if p_task_type = 'classification'
    and not (candidate.model_params ? 'portable_classifier')
    and not coalesce(portable_runtime, false)
  then
    raise exception 'classification candidate is missing a compatible runtime artifact';
  end if;

  update public.model_registry
  set is_active = false,
      activated_at = null
  where province_id = p_province_id
    and task_type = p_task_type
    and is_active;

  update public.model_registry
  set is_active = true,
      activated_at = now()
  where id = candidate.id;

  return jsonb_build_object(
    'province_id', p_province_id,
    'task_type', p_task_type,
    'model_name', candidate.model_name,
    'run_id', candidate.run_id,
    'eligibility_status', candidate.eligibility_status,
    'evidence_status', candidate.evidence_status,
    'runtime_contract', case
      when portable_runtime then 'portable-tree-ensemble-v1'
      else 'legacy'
    end,
    'override_used', p_allow_ineligible,
    'activated', true
  );
end;
$$;

comment on function public.fn_activate_model_task(text, text, text, uuid, boolean) is
  'Activates one eligible task candidate; supports legacy artifacts and checksum-addressed portable pooled tree artifacts.';

revoke all on function public.fn_activate_model_task(text, text, text, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.fn_activate_model_task(text, text, text, uuid, boolean)
  to service_role;

create or replace function public.fn_activate_pooled_model_run(
  p_run_id uuid,
  p_task_type text,
  p_required_provinces integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate_count integer;
  invalid_count integer;
  province_ids text[];
begin
  if p_task_type not in ('regression', 'classification') then
    raise exception 'unsupported model task type %', p_task_type;
  end if;
  if p_required_provinces < 1 then
    raise exception 'p_required_provinces must be positive';
  end if;

  select count(*), array_agg(candidate.province_id order by candidate.province_id)
  into candidate_count, province_ids
  from public.model_registry candidate
  where candidate.run_id = p_run_id
    and candidate.task_type = p_task_type;

  if candidate_count <> p_required_provinces
    or cardinality(array(select distinct unnest(province_ids))) <> p_required_provinces
  then
    raise exception 'expected % distinct candidates, found %',
      p_required_provinces, candidate_count;
  end if;

  select count(*)
  into invalid_count
  from public.model_registry candidate
  where candidate.run_id = p_run_id
    and candidate.task_type = p_task_type
    and (
      not candidate.eligibility_status
      or candidate.feature_schema is null
      or not coalesce(candidate.feature_schema ? 'columns', false)
      or coalesce(jsonb_typeof(candidate.feature_schema->'columns') <> 'array', true)
      or case
        when jsonb_typeof(candidate.feature_schema->'columns') = 'array'
          then jsonb_array_length(candidate.feature_schema->'columns') = 0
        else true
      end
      or not coalesce(candidate.runtime_artifact_uri like 'storage://model-artifacts/%', false)
      or not coalesce(candidate.runtime_artifact_sha256 ~ '^[0-9a-f]{64}$', false)
      or coalesce(candidate.runtime_artifact_byte_size, 0) <= 0
      or coalesce(candidate.runtime_artifact_format, '') <> 'json+gzip'
      or not exists (
        select 1
        from public.model_artifacts artifact
        where artifact.model_registry_id = candidate.id
          and artifact.artifact_kind = 'serving_portable'
          and artifact.storage_uri = candidate.runtime_artifact_uri
          and artifact.sha256 = candidate.runtime_artifact_sha256
      )
      or (
        p_task_type = 'classification'
        and (
          candidate.evidence_status <> 'validated'
          or coalesce(
            nullif(coalesce(
              candidate.model_params->'global_test_metrics',
              candidate.metrics
            ) #>> '{per_class,4,support}', '')::integer,
            0
          ) < 5
          or coalesce(
            nullif(coalesce(
              candidate.model_params->'global_test_metrics',
              candidate.metrics
            ) #>> '{per_class,5,support}', '')::integer,
            0
          ) < 5
          or coalesce(
            coalesce(
              candidate.model_params->'global_test_metrics',
              candidate.metrics
            )->'metric_class_contract',
            '[]'::jsonb
          ) <> '[1,2,3,4,5]'::jsonb
        )
      )
    );

  if invalid_count > 0 then
    raise exception '% pooled candidates failed activation preflight', invalid_count;
  end if;

  perform 1
  from public.isan_provinces province
  where province.province_id = any(province_ids)
  order by province.province_id
  for update;

  update public.model_registry active
  set is_active = false,
      activated_at = null
  where active.task_type = p_task_type
    and active.province_id = any(province_ids)
    and active.is_active;

  update public.model_registry candidate
  set is_active = true,
      activated_at = now()
  where candidate.run_id = p_run_id
    and candidate.task_type = p_task_type;

  return jsonb_build_object(
    'run_id', p_run_id,
    'task_type', p_task_type,
    'activated', candidate_count,
    'provinces', province_ids,
    'atomic', true
  );
end;
$$;

comment on function public.fn_activate_pooled_model_run(uuid, text, integer) is
  'Atomically activates a complete eligible pooled portable model run for one task across the required province set.';

revoke all on function public.fn_activate_pooled_model_run(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.fn_activate_pooled_model_run(uuid, text, integer)
  to service_role;
