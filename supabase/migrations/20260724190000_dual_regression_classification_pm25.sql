-- Dual PM2.5 regression + classification support.
-- Forward-only and backward compatible: existing registry rows become
-- regression rows; existing forecast rows remain readable.

alter table public.model_registry
  alter column model_name type text,
  add column if not exists task_type text not null default 'regression',
  add column if not exists model_family text,
  add column if not exists model_version text,
  add column if not exists artifact_ref text,
  add column if not exists feature_schema jsonb,
  add column if not exists feature_version text,
  add column if not exists threshold_version text,
  add column if not exists validation_start date,
  add column if not exists validation_end date,
  add column if not exists validation_rows integer,
  add column if not exists test_rows integer,
  add column if not exists metrics jsonb not null default '{}'::jsonb,
  add column if not exists baseline_metrics jsonb not null default '{}'::jsonb,
  add column if not exists class_distribution jsonb not null default '{}'::jsonb,
  add column if not exists eligibility_status boolean not null default true,
  add column if not exists eligibility_reason text,
  add column if not exists activated_at timestamptz,
  add column if not exists code_version text;

update public.model_registry
set feature_schema = jsonb_build_object(
      'columns',
      coalesce(
        model_params->'feature_cols',
        model_params->'surrogate'->'feature_cols',
        '[]'::jsonb
      ),
      'ordered', true
    ),
    feature_version = coalesce(
      feature_version,
      model_params->>'feature_version',
      model_params->>'feature_schema_version'
    ),
    model_family = coalesce(model_family, model_params->>'teacher_model')
where feature_schema is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.model_registry'::regclass
      and conname = 'model_registry_task_type_check'
  ) then
    alter table public.model_registry
      add constraint model_registry_task_type_check
      check (task_type in ('regression', 'classification'));
  end if;
end
$$;

-- Existing active rows remain active as regression models. The new index
-- permits one independent active classifier for the same province.
drop index if exists public.uq_model_registry_one_active_per_province;
drop index if exists public.idx_model_registry_one_active_per_province;
drop index if exists public.uq_model_registry_model_run;

create unique index if not exists uq_model_registry_model_run_task
  on public.model_registry (model_name, province_id, run_id, task_type);

create unique index if not exists uq_model_registry_one_active_per_task
  on public.model_registry (province_id, task_type)
  where is_active and province_id is not null;

create index if not exists idx_model_registry_active_task_lookup
  on public.model_registry (province_id, task_type, trained_at desc)
  where is_active;

create index if not exists idx_model_registry_run_id
  on public.model_registry (run_id);

alter table public.forecast_daily
  alter column model_name type text,
  add column if not exists regression_model_name text,
  add column if not exists regression_run_id uuid,
  add column if not exists regression_derived_class smallint,
  add column if not exists classifier_predicted_class smallint,
  add column if not exists displayed_class smallint,
  add column if not exists class_label_th text,
  add column if not exists class_label_en text,
  add column if not exists classifier_model_name text,
  add column if not exists classifier_run_id uuid,
  add column if not exists confidence numeric,
  add column if not exists class_probabilities jsonb,
  add column if not exists class_agreement boolean,
  add column if not exists classification_source text,
  add column if not exists fallback_used boolean not null default false,
  add column if not exists fallback_reason text,
  add column if not exists data_freshness timestamptz,
  add column if not exists feature_version text,
  add column if not exists forecast_horizon_days smallint;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.forecast_daily'::regclass
      and conname = 'forecast_daily_regression_class_check'
  ) then
    alter table public.forecast_daily
      add constraint forecast_daily_regression_class_check
      check (regression_derived_class is null or regression_derived_class between 1 and 5);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.forecast_daily'::regclass
      and conname = 'forecast_daily_classifier_class_check'
  ) then
    alter table public.forecast_daily
      add constraint forecast_daily_classifier_class_check
      check (classifier_predicted_class is null or classifier_predicted_class between 1 and 5);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.forecast_daily'::regclass
      and conname = 'forecast_daily_displayed_class_check'
  ) then
    alter table public.forecast_daily
      add constraint forecast_daily_displayed_class_check
      check (displayed_class is null or displayed_class between 1 and 5);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.forecast_daily'::regclass
      and conname = 'forecast_daily_confidence_check'
  ) then
    alter table public.forecast_daily
      add constraint forecast_daily_confidence_check
      check (confidence is null or confidence between 0 and 1);
  end if;
end
$$;

create index if not exists idx_forecast_daily_latest_target
  on public.forecast_daily (province_id, target_date desc, forecast_at desc);

-- Registration never activates a candidate. Missing task_type remains
-- regression so existing notebooks and scripts keep working.
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
      model_version, artifact_ref, feature_schema, feature_version,
      threshold_version, trained_at, training_rows, validation_rows,
      test_rows, mae, rmse, r2, is_active, model_params, data_cutoff,
      train_start, train_end, validation_start, validation_end,
      test_start, test_end, source, metrics, baseline_metrics,
      class_distribution, eligibility_status, eligibility_reason,
      code_version
    )
    values (
      r->>'model_name',
      r->>'province_id',
      coalesce(nullif(r->>'run_id', '')::uuid, gen_random_uuid()),
      resolved_task,
      r->>'model_family',
      r->>'model_version',
      r->>'artifact_ref',
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
      activated_at = null;

    upserted := upserted + 1;
  end loop;

  return jsonb_build_object('upserted', upserted, 'activated', 0);
end;
$$;

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
  then
    raise exception 'regression candidate is missing a compatible runtime artifact';
  end if;

  if p_task_type = 'classification'
    and not (candidate.model_params ? 'portable_classifier')
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
    'override_used', p_allow_ineligible,
    'activated', true
  );
end;
$$;

-- Backward-compatible regression activation used by existing notebooks.
create or replace function public.fn_activate_model(
  p_province_id varchar,
  p_model_name varchar,
  p_run_id uuid default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.fn_activate_model_task(
    p_province_id::text,
    'regression'::text,
    p_model_name::text,
    p_run_id,
    p_model_name::text = 'persist-revert-v2'
  );
$$;

create or replace function public.fn_upsert_forecast_daily(rows jsonb)
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
    insert into public.forecast_daily (
      province_id, forecast_at, target_date, pm25_mean_forecast,
      pm25_max_forecast, model_name, regression_model_name,
      regression_run_id, regression_derived_class,
      classifier_predicted_class, displayed_class, class_label_th,
      class_label_en, classifier_model_name, classifier_run_id,
      confidence, class_probabilities, class_agreement,
      classification_source, fallback_used, fallback_reason,
      data_freshness, feature_version, forecast_horizon_days
    )
    values (
      r->>'province_id',
      (r->>'forecast_at')::timestamptz,
      (r->>'target_date')::date,
      (r->>'pm25_mean_forecast')::numeric,
      nullif(r->>'pm25_max_forecast', '')::numeric,
      r->>'model_name',
      r->>'regression_model_name',
      nullif(r->>'regression_run_id', '')::uuid,
      nullif(r->>'regression_derived_class', '')::smallint,
      nullif(r->>'classifier_predicted_class', '')::smallint,
      nullif(r->>'displayed_class', '')::smallint,
      r->>'class_label_th',
      r->>'class_label_en',
      r->>'classifier_model_name',
      nullif(r->>'classifier_run_id', '')::uuid,
      nullif(r->>'confidence', '')::numeric,
      r->'class_probabilities',
      nullif(r->>'class_agreement', '')::boolean,
      r->>'classification_source',
      coalesce((r->>'fallback_used')::boolean, false),
      r->>'fallback_reason',
      nullif(r->>'data_freshness', '')::timestamptz,
      r->>'feature_version',
      nullif(r->>'forecast_horizon_days', '')::smallint
    )
    on conflict (province_id, forecast_at, target_date, model_name)
    do update set
      pm25_mean_forecast = excluded.pm25_mean_forecast,
      pm25_max_forecast = excluded.pm25_max_forecast,
      regression_model_name = excluded.regression_model_name,
      regression_run_id = excluded.regression_run_id,
      regression_derived_class = excluded.regression_derived_class,
      classifier_predicted_class = excluded.classifier_predicted_class,
      displayed_class = excluded.displayed_class,
      class_label_th = excluded.class_label_th,
      class_label_en = excluded.class_label_en,
      classifier_model_name = excluded.classifier_model_name,
      classifier_run_id = excluded.classifier_run_id,
      confidence = excluded.confidence,
      class_probabilities = excluded.class_probabilities,
      class_agreement = excluded.class_agreement,
      classification_source = excluded.classification_source,
      fallback_used = excluded.fallback_used,
      fallback_reason = excluded.fallback_reason,
      data_freshness = excluded.data_freshness,
      feature_version = excluded.feature_version,
      forecast_horizon_days = excluded.forecast_horizon_days;
    upserted := upserted + 1;
  end loop;
  return jsonb_build_object('upserted', upserted);
end;
$$;

revoke all on function public.fn_upsert_model_registry(jsonb)
  from public, anon, authenticated;
revoke all on function public.fn_activate_model_task(text, text, text, uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.fn_activate_model(varchar, varchar, uuid)
  from public, anon, authenticated;
revoke all on function public.fn_upsert_forecast_daily(jsonb)
  from public, anon, authenticated;

grant execute on function public.fn_upsert_model_registry(jsonb) to service_role;
grant execute on function public.fn_activate_model_task(text, text, text, uuid, boolean)
  to service_role;
grant execute on function public.fn_activate_model(varchar, varchar, uuid)
  to service_role;
grant execute on function public.fn_upsert_forecast_daily(jsonb) to service_role;

comment on function public.fn_activate_model_task(text, text, text, uuid, boolean) is
  'Atomically activates one eligible regression or classification model per province.';
comment on column public.forecast_daily.class_agreement is
  'True when the direct classifier class equals the regression-threshold class.';
