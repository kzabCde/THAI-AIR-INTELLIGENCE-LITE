-- Register exact portable tree artifacts for pooled LightGBM/RF serving.
-- The columns are nullable so every legacy active model remains readable and
-- no model is activated or deactivated by this migration.

set lock_timeout = '5s';
set statement_timeout = '90s';

alter table public.model_registry
  add column if not exists runtime_artifact_uri text,
  add column if not exists runtime_artifact_sha256 text,
  add column if not exists runtime_artifact_byte_size bigint,
  add column if not exists runtime_artifact_format text;

alter table public.model_registry
  drop constraint if exists model_registry_runtime_artifact_contract;

alter table public.model_registry
  add constraint model_registry_runtime_artifact_contract
  check (
    (
      runtime_artifact_uri is null
      and runtime_artifact_sha256 is null
      and runtime_artifact_byte_size is null
      and runtime_artifact_format is null
    )
    or (
      runtime_artifact_uri like 'storage://model-artifacts/%'
      and runtime_artifact_sha256 ~ '^[0-9a-f]{64}$'
      and runtime_artifact_byte_size > 0
      and runtime_artifact_format = 'json+gzip'
    )
  ) not valid;

alter table public.model_registry
  validate constraint model_registry_runtime_artifact_contract;

alter table public.forecast_daily
  drop constraint if exists forecast_daily_horizon_reliability_check;

alter table public.forecast_daily
  add constraint forecast_daily_horizon_reliability_check
  check (
    horizon_reliability is null
    or horizon_reliability in (
      'validated_d1',
      'evaluated_d1',
      'experimental_direct',
      'experimental_recursive',
      'legacy_unverified_d1',
      'legacy_unverified',
      'typescript_fallback'
    )
  ) not valid;

alter table public.forecast_daily
  validate constraint forecast_daily_horizon_reliability_check;

create or replace function public.fn_upsert_model_registry(rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb;
  upserted integer := 0;
  resolved_task text;
  registry_id bigint;
begin
  if jsonb_typeof(rows) <> 'array' then
    raise exception 'rows must be a JSON array';
  end if;

  for r in select * from jsonb_array_elements(rows)
  loop
    resolved_task := coalesce(nullif(r->>'task_type', ''), 'regression');
    if resolved_task not in ('regression', 'classification') then
      raise exception 'unsupported model task type %', resolved_task;
    end if;

    insert into public.model_registry (
      model_name, province_id, run_id, task_type, model_family,
      model_version, artifact_ref, artifact_uri, artifact_sha256,
      runtime_artifact_uri, runtime_artifact_sha256,
      runtime_artifact_byte_size, runtime_artifact_format,
      teacher_model_family, serving_model_family, evidence_status,
      feature_schema, feature_version, threshold_version, trained_at,
      training_rows, validation_rows, test_rows, mae, rmse, r2,
      is_active, model_params, data_cutoff, train_start, train_end,
      validation_start, validation_end, test_start, test_end, source,
      metrics, baseline_metrics, class_distribution, eligibility_status,
      eligibility_reason, code_version
    )
    values (
      r->>'model_name',
      r->>'province_id',
      coalesce(nullif(r->>'run_id', '')::uuid, gen_random_uuid()),
      resolved_task,
      r->>'model_family',
      r->>'model_version',
      r->>'artifact_ref',
      r->>'artifact_uri',
      r->>'artifact_sha256',
      r->>'runtime_artifact_uri',
      r->>'runtime_artifact_sha256',
      nullif(r->>'runtime_artifact_byte_size', '')::bigint,
      r->>'runtime_artifact_format',
      coalesce(
        r->>'teacher_model_family',
        r->'model_params'->>'teacher_model_family',
        r->>'model_family'
      ),
      coalesce(
        r->>'serving_model_family',
        r->'model_params'->>'serving_model_family'
      ),
      coalesce(
        nullif(r->>'evidence_status', ''),
        case
          when coalesce((r->>'eligibility_status')::boolean, false)
            then 'validated'
          when resolved_task = 'classification'
            then 'insufficient_evidence'
          else 'ineligible'
        end
      ),
      coalesce(
        r->'feature_schema',
        jsonb_build_object(
          'columns',
          coalesce(
            r->'model_params'->'feature_cols',
            r->'model_params'->'surrogate'->'feature_cols',
            '[]'::jsonb
          ),
          'ordered',
          true
        )
      ),
      r->>'feature_version',
      r->>'threshold_version',
      coalesce(nullif(r->>'trained_at', '')::timestamptz, now()),
      nullif(r->>'training_rows', '')::integer,
      nullif(r->>'validation_rows', '')::integer,
      nullif(r->>'test_rows', '')::integer,
      nullif(r->>'mae', '')::numeric,
      nullif(r->>'rmse', '')::numeric,
      nullif(r->>'r2', '')::numeric,
      false,
      coalesce(r->'model_params', '{}'::jsonb),
      nullif(r->>'data_cutoff', '')::date,
      nullif(r->>'train_start', '')::date,
      nullif(r->>'train_end', '')::date,
      nullif(r->>'validation_start', '')::date,
      nullif(r->>'validation_end', '')::date,
      nullif(r->>'test_start', '')::date,
      nullif(r->>'test_end', '')::date,
      r->>'source',
      coalesce(r->'metrics', '{}'::jsonb),
      coalesce(r->'baseline_metrics', '{}'::jsonb),
      coalesce(r->'class_distribution', '{}'::jsonb),
      coalesce(
        (r->>'eligibility_status')::boolean,
        (r->'model_params'->>'eligible_for_activation')::boolean,
        false
      ),
      r->>'eligibility_reason',
      r->>'code_version'
    )
    on conflict (model_name, province_id, run_id, task_type) do update set
      model_family = excluded.model_family,
      model_version = excluded.model_version,
      artifact_ref = excluded.artifact_ref,
      artifact_uri = excluded.artifact_uri,
      artifact_sha256 = excluded.artifact_sha256,
      runtime_artifact_uri = excluded.runtime_artifact_uri,
      runtime_artifact_sha256 = excluded.runtime_artifact_sha256,
      runtime_artifact_byte_size = excluded.runtime_artifact_byte_size,
      runtime_artifact_format = excluded.runtime_artifact_format,
      teacher_model_family = excluded.teacher_model_family,
      serving_model_family = excluded.serving_model_family,
      evidence_status = excluded.evidence_status,
      feature_schema = excluded.feature_schema,
      feature_version = excluded.feature_version,
      threshold_version = excluded.threshold_version,
      trained_at = excluded.trained_at,
      training_rows = excluded.training_rows,
      validation_rows = excluded.validation_rows,
      test_rows = excluded.test_rows,
      mae = excluded.mae,
      rmse = excluded.rmse,
      r2 = excluded.r2,
      model_params = excluded.model_params,
      data_cutoff = excluded.data_cutoff,
      train_start = excluded.train_start,
      train_end = excluded.train_end,
      validation_start = excluded.validation_start,
      validation_end = excluded.validation_end,
      test_start = excluded.test_start,
      test_end = excluded.test_end,
      source = excluded.source,
      metrics = excluded.metrics,
      baseline_metrics = excluded.baseline_metrics,
      class_distribution = excluded.class_distribution,
      eligibility_status = excluded.eligibility_status,
      eligibility_reason = excluded.eligibility_reason,
      code_version = excluded.code_version,
      is_active = false,
      activated_at = null
    returning id into registry_id;

    if nullif(r->>'artifact_uri', '') is not null
      and nullif(r->>'artifact_sha256', '') is not null
    then
      insert into public.model_artifacts (
        model_registry_id, artifact_kind, storage_uri, sha256,
        byte_size, content_type, dependency_lock
      )
      values (
        registry_id,
        'teacher_native',
        r->>'artifact_uri',
        r->>'artifact_sha256',
        nullif(r->>'artifact_byte_size', '')::bigint,
        coalesce(r->>'artifact_content_type', 'application/octet-stream'),
        coalesce(r->'dependency_lock', '{}'::jsonb)
      )
      on conflict (model_registry_id, artifact_kind, sha256)
      do update set
        storage_uri = excluded.storage_uri,
        byte_size = excluded.byte_size,
        content_type = excluded.content_type,
        dependency_lock = excluded.dependency_lock;
    end if;

    if nullif(r->>'runtime_artifact_uri', '') is not null
      and nullif(r->>'runtime_artifact_sha256', '') is not null
    then
      insert into public.model_artifacts (
        model_registry_id, artifact_kind, storage_uri, sha256,
        byte_size, content_type, dependency_lock
      )
      values (
        registry_id,
        'serving_portable',
        r->>'runtime_artifact_uri',
        r->>'runtime_artifact_sha256',
        nullif(r->>'runtime_artifact_byte_size', '')::bigint,
        'application/octet-stream',
        coalesce(r->'dependency_lock', '{}'::jsonb)
      )
      on conflict (model_registry_id, artifact_kind, sha256)
      do update set
        storage_uri = excluded.storage_uri,
        byte_size = excluded.byte_size,
        content_type = excluded.content_type,
        dependency_lock = excluded.dependency_lock;
    end if;

    upserted := upserted + 1;
  end loop;

  return jsonb_build_object('upserted', upserted, 'activated', 0);
end;
$$;

comment on function public.fn_upsert_model_registry(jsonb) is
  'Registers inactive model candidates and immutable native/runtime artifacts. Activation remains a separate eligibility-gated operation.';

revoke all on function public.fn_upsert_model_registry(jsonb)
  from public, anon, authenticated;
grant execute on function public.fn_upsert_model_registry(jsonb)
  to service_role;
