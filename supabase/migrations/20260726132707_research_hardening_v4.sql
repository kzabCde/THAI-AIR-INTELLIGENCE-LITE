-- Research hardening v4
-- - removes synthetic hotspot lineage from the production training contract
-- - blocks five-class promotion when critical-class evidence is missing
-- - records teacher/serving artifacts separately
-- - adds calibrated intervals and horizon reliability
-- - adds ground-station, provenance, evaluation, artifact and drift contracts

create or replace view public.training_daily_summary_v2
with (security_invoker = true)
as
with air_lineage as (
  select
    aq.province_id,
    (aq.observed_at at time zone 'Asia/Bangkok')::date as date,
    count(distinct date_trunc(
      'hour',
      aq.observed_at at time zone 'Asia/Bangkok'
    )) filter (
      where aq.pm25 is not null
        and lower(aq.source) not in ('synthetic', 'mock', 'demo')
    )::integer as trusted_hours,
    array_agg(distinct aq.source order by aq.source) filter (
      where aq.pm25 is not null
        and lower(aq.source) not in ('synthetic', 'mock', 'demo')
    ) as trusted_sources
  from public.air_quality_hourly as aq
  group by
    aq.province_id,
    (aq.observed_at at time zone 'Asia/Bangkok')::date
),
hotspot_lineage as (
  select
    hd.province_id,
    hd.date,
    sum(hd.hotspot_count)::integer as observed_hotspot_count,
    sum(coalesce(hd.total_frp, 0))::numeric as observed_total_frp,
    array_agg(distinct hd.source order by hd.source) as observed_hotspot_sources
  from public.hotspot_daily as hd
  where lower(hd.source) not in ('synthetic', 'mock', 'demo')
  group by hd.province_id, hd.date
)
select
  ds.*,
  air_lineage.trusted_hours,
  air_lineage.trusted_sources,
  (hotspot_lineage.province_id is not null) as hotspot_lineage_is_trusted,
  hotspot_lineage.observed_hotspot_count,
  hotspot_lineage.observed_total_frp,
  hotspot_lineage.observed_hotspot_sources,
  jsonb_build_object(
    'pm25', jsonb_build_object(
      'trusted_hours', air_lineage.trusted_hours,
      'sources', to_jsonb(air_lineage.trusted_sources),
      'synthetic_allowed', false
    ),
    'hotspot', jsonb_build_object(
      'eligible', hotspot_lineage.province_id is not null,
      'sources', coalesce(
        to_jsonb(hotspot_lineage.observed_hotspot_sources),
        '[]'::jsonb
      ),
      'excluded_from_feature_version', 'daily-observed-v4'
    )
  ) as feature_provenance
from public.daily_summary as ds
join air_lineage
  on air_lineage.province_id = ds.province_id
 and air_lineage.date = ds.date
left join hotspot_lineage
  on hotspot_lineage.province_id = ds.province_id
 and hotspot_lineage.date = ds.date
where air_lineage.trusted_hours >= 18
  and coalesce(ds.hours_available, 0) >= 18;

revoke all on public.training_daily_summary_v2
  from public, anon, authenticated;
grant select on public.training_daily_summary_v2 to service_role;

comment on view public.training_daily_summary_v2 is
  'Observed PM2.5 daily features with explicit air/hotspot lineage. Synthetic hotspot values are excluded from the v4 production feature contract.';

alter table public.model_registry
  add column if not exists teacher_model_family text,
  add column if not exists serving_model_family text,
  add column if not exists artifact_uri text,
  add column if not exists artifact_sha256 text,
  add column if not exists evidence_status text not null default 'legacy';

alter table public.forecast_daily
  add column if not exists pm25_p10_forecast numeric,
  add column if not exists pm25_p50_forecast numeric,
  add column if not exists pm25_p90_forecast numeric,
  add column if not exists horizon_reliability text,
  add column if not exists is_experimental boolean not null default true,
  add column if not exists uncertainty_method text;

update public.forecast_daily
set pm25_p50_forecast = coalesce(pm25_p50_forecast, pm25_mean_forecast),
    pm25_p90_forecast = coalesce(pm25_p90_forecast, pm25_max_forecast),
    horizon_reliability = coalesce(
      horizon_reliability,
      case
        when forecast_horizon_days = 1 then 'legacy_unverified_d1'
        else 'legacy_unverified'
      end
    ),
    is_experimental = coalesce(forecast_horizon_days, 2) <> 1
where pm25_p50_forecast is null
   or horizon_reliability is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.model_registry'::regclass
      and conname = 'model_registry_evidence_status_check'
  ) then
    alter table public.model_registry
      add constraint model_registry_evidence_status_check
      check (
        evidence_status in (
          'legacy',
          'validated',
          'ineligible',
          'insufficient_evidence'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.forecast_daily'::regclass
      and conname = 'forecast_daily_interval_order_check'
  ) then
    alter table public.forecast_daily
      add constraint forecast_daily_interval_order_check
      check (
        pm25_p10_forecast is null
        or pm25_p50_forecast is null
        or pm25_p90_forecast is null
        or (
          pm25_p10_forecast <= pm25_p50_forecast
          and pm25_p50_forecast <= pm25_p90_forecast
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.forecast_daily'::regclass
      and conname = 'forecast_daily_horizon_reliability_check'
  ) then
    alter table public.forecast_daily
      add constraint forecast_daily_horizon_reliability_check
      check (
        horizon_reliability is null
        or horizon_reliability in (
          'validated_d1',
          'experimental_recursive',
          'legacy_unverified_d1',
          'legacy_unverified',
          'typescript_fallback'
        )
      );
  end if;
end
$$;

-- Existing classifiers without five-class evidence must not remain active.
update public.model_registry
set is_active = false,
    activated_at = null,
    eligibility_status = false,
    evidence_status = 'insufficient_evidence',
    eligibility_reason = concat_ws(
      ',',
      nullif(eligibility_reason, ''),
      'insufficient_evidence_class:4',
      'insufficient_evidence_class:5'
    )
where task_type = 'classification'
  and (
    coalesce(
      nullif(metrics #>> '{per_class,4,support}', '')::integer,
      0
    ) < 5
    or coalesce(
      nullif(metrics #>> '{per_class,5,support}', '')::integer,
      0
    ) < 5
    or coalesce(metrics->'metric_class_contract', '[]'::jsonb)
      <> '[1,2,3,4,5]'::jsonb
  );

create table if not exists public.stations (
  station_id text primary key,
  province_id varchar(5) not null
    references public.isan_provinces(province_id),
  source text not null,
  name_th text,
  name_en text,
  latitude double precision not null,
  longitude double precision not null,
  elevation_m real,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.station_observations (
  id bigint generated by default as identity primary key,
  station_id text not null references public.stations(station_id),
  observed_at timestamptz not null,
  pm25 numeric,
  pm10 numeric,
  aqi integer,
  source text not null,
  source_record_id text,
  quality_flag text not null default 'unverified',
  is_production_eligible boolean not null default false,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (station_id, observed_at, source)
);

create table if not exists public.region_membership (
  province_id varchar(5) not null
    references public.isan_provinces(province_id),
  region_level text not null,
  region_code text not null,
  region_name_th text,
  region_name_en text,
  is_primary boolean not null default true,
  valid_from date not null default date '1900-01-01',
  valid_to date,
  primary key (province_id, region_level, region_code, valid_from),
  check (region_level in ('national', 'macro_region', 'forecast_pool'))
);

insert into public.region_membership (
  province_id,
  region_level,
  region_code,
  region_name_th,
  region_name_en
)
select
  province_id,
  'macro_region',
  'TH-NORTHEAST',
  'ภาคตะวันออกเฉียงเหนือ',
  'Northeast Thailand'
from public.isan_provinces
on conflict do nothing;

create table if not exists public.feature_snapshots (
  snapshot_id uuid primary key default gen_random_uuid(),
  province_id varchar(5) not null
    references public.isan_provinces(province_id),
  feature_date date not null,
  feature_version text not null,
  features jsonb not null,
  provenance jsonb not null,
  missingness jsonb not null default '{}'::jsonb,
  quality_status text not null,
  source_latency_seconds integer,
  created_at timestamptz not null default now(),
  unique (province_id, feature_date, feature_version)
);

create table if not exists public.forecast_runs (
  run_id uuid primary key default gen_random_uuid(),
  forecast_at timestamptz not null,
  source_as_of timestamptz,
  feature_version text,
  code_version text,
  serving_policy text,
  horizon_days smallint not null,
  status text not null default 'running',
  configuration jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  check (horizon_days between 1 and 14),
  check (status in ('running', 'success', 'partial', 'error'))
);

create table if not exists public.forecast_evaluations (
  id bigint generated by default as identity primary key,
  forecast_daily_id bigint not null
    references public.forecast_daily(id) on delete cascade,
  actual_pm25 numeric not null,
  actual_class smallint,
  actual_source text not null,
  actual_observed_at timestamptz,
  absolute_error numeric,
  squared_error numeric,
  interval_covered boolean,
  class_correct boolean,
  evaluated_at timestamptz not null default now()
);

create unique index if not exists uq_forecast_evaluations_daily
  on public.forecast_evaluations (forecast_daily_id);

create table if not exists public.model_artifacts (
  artifact_id uuid primary key default gen_random_uuid(),
  model_registry_id bigint not null
    references public.model_registry(id) on delete cascade,
  artifact_kind text not null,
  storage_uri text not null,
  sha256 text not null,
  byte_size bigint,
  content_type text,
  dependency_lock jsonb not null default '{}'::jsonb,
  immutable boolean not null default true,
  created_at timestamptz not null default now(),
  unique (model_registry_id, artifact_kind, sha256),
  check (artifact_kind in ('teacher_native', 'serving_portable', 'metadata'))
);

create table if not exists public.model_drift_metrics (
  id bigint generated by default as identity primary key,
  model_registry_id bigint not null
    references public.model_registry(id) on delete cascade,
  province_id varchar(5) not null
    references public.isan_provinces(province_id),
  window_start date not null,
  window_end date not null,
  horizon_days smallint not null,
  sample_count integer not null,
  mae numeric,
  rmse numeric,
  bias numeric,
  macro_f1 numeric,
  brier_score numeric,
  expected_calibration_error numeric,
  interval_coverage numeric,
  feature_drift jsonb not null default '{}'::jsonb,
  residual_drift jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (model_registry_id, window_start, window_end, horizon_days)
);

create table if not exists public.pipeline_alerts (
  alert_id bigint generated by default as identity primary key,
  job_name text not null,
  severity text not null,
  fingerprint text not null,
  message text not null,
  details jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (severity in ('info', 'warning', 'critical'))
);

create index if not exists idx_station_observations_station_time
  on public.station_observations (station_id, observed_at desc)
  where is_production_eligible;
create index if not exists idx_feature_snapshots_province_date
  on public.feature_snapshots (province_id, feature_date desc);
create index if not exists idx_forecast_runs_forecast_at
  on public.forecast_runs (forecast_at desc);
create index if not exists idx_model_drift_province_window
  on public.model_drift_metrics (province_id, window_end desc);
create index if not exists idx_pipeline_alerts_open
  on public.pipeline_alerts (severity, last_seen_at desc)
  where resolved_at is null;
create unique index if not exists uq_pipeline_alerts_open_fingerprint
  on public.pipeline_alerts (job_name, fingerprint)
  where resolved_at is null;

alter table public.stations enable row level security;
alter table public.station_observations enable row level security;
alter table public.region_membership enable row level security;
alter table public.feature_snapshots enable row level security;
alter table public.forecast_runs enable row level security;
alter table public.forecast_evaluations enable row level security;
alter table public.model_artifacts enable row level security;
alter table public.model_drift_metrics enable row level security;
alter table public.pipeline_alerts enable row level security;

revoke all on table
  public.stations,
  public.station_observations,
  public.region_membership,
  public.feature_snapshots,
  public.forecast_runs,
  public.forecast_evaluations,
  public.model_artifacts,
  public.model_drift_metrics,
  public.pipeline_alerts
from public, anon, authenticated;

grant all on table
  public.stations,
  public.station_observations,
  public.region_membership,
  public.feature_snapshots,
  public.forecast_runs,
  public.forecast_evaluations,
  public.model_artifacts,
  public.model_drift_metrics,
  public.pipeline_alerts
to service_role;

grant usage, select on all sequences in schema public to service_role;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'model-artifacts',
  'model-artifacts',
  false,
  524288000,
  array[
    'application/octet-stream',
    'application/json'
  ]::text[]
)
on conflict (id) do nothing;

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
        model_registry_id,
        artifact_kind,
        storage_uri,
        sha256,
        byte_size,
        content_type,
        dependency_lock
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

    upserted := upserted + 1;
  end loop;

  return jsonb_build_object('upserted', upserted, 'activated', 0);
end;
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
      pm25_max_forecast, pm25_p10_forecast, pm25_p50_forecast,
      pm25_p90_forecast, model_name, regression_model_name,
      regression_run_id, regression_derived_class,
      classifier_predicted_class, displayed_class, class_label_th,
      class_label_en, classifier_model_name, classifier_run_id,
      confidence, class_probabilities, class_agreement,
      classification_source, fallback_used, fallback_reason,
      data_freshness, feature_version, forecast_horizon_days,
      horizon_reliability, is_experimental, uncertainty_method
    )
    values (
      r->>'province_id',
      (r->>'forecast_at')::timestamptz,
      (r->>'target_date')::date,
      (r->>'pm25_mean_forecast')::numeric,
      nullif(r->>'pm25_max_forecast', '')::numeric,
      nullif(r->>'pm25_p10_forecast', '')::numeric,
      nullif(r->>'pm25_p50_forecast', '')::numeric,
      nullif(r->>'pm25_p90_forecast', '')::numeric,
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
      nullif(r->>'forecast_horizon_days', '')::smallint,
      r->>'horizon_reliability',
      coalesce((r->>'is_experimental')::boolean, true),
      r->>'uncertainty_method'
    )
    on conflict (province_id, forecast_at, target_date, model_name)
    do update set
      pm25_mean_forecast = excluded.pm25_mean_forecast,
      pm25_max_forecast = excluded.pm25_max_forecast,
      pm25_p10_forecast = excluded.pm25_p10_forecast,
      pm25_p50_forecast = excluded.pm25_p50_forecast,
      pm25_p90_forecast = excluded.pm25_p90_forecast,
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
      forecast_horizon_days = excluded.forecast_horizon_days,
      horizon_reliability = excluded.horizon_reliability,
      is_experimental = excluded.is_experimental,
      uncertainty_method = excluded.uncertainty_method;
    upserted := upserted + 1;
  end loop;
  return jsonb_build_object('upserted', upserted);
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

  if p_task_type = 'classification'
    and (
      candidate.evidence_status <> 'validated'
      or coalesce(
        nullif(candidate.metrics #>> '{per_class,4,support}', '')::integer,
        0
      ) < 5
      or coalesce(
        nullif(candidate.metrics #>> '{per_class,5,support}', '')::integer,
        0
      ) < 5
      or coalesce(
        candidate.metrics->'metric_class_contract',
        '[]'::jsonb
      ) <> '[1,2,3,4,5]'::jsonb
    )
  then
    raise exception
      'classification candidate lacks validated five-class evidence';
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
    raise exception
      'regression candidate is missing a compatible runtime artifact';
  end if;

  if p_task_type = 'classification'
    and not (candidate.model_params ? 'portable_classifier')
  then
    raise exception
      'classification candidate is missing a compatible runtime artifact';
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
    'override_used', p_allow_ineligible,
    'activated', true
  );
end;
$$;

create or replace function public.fn_record_pipeline_alert(
  p_job_name text,
  p_fingerprint text,
  p_message text,
  p_severity text default 'warning',
  p_details jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  recorded_id bigint;
begin
  if p_severity not in ('info', 'warning', 'critical') then
    raise exception 'unsupported alert severity %', p_severity;
  end if;
  if nullif(trim(p_job_name), '') is null
    or nullif(trim(p_fingerprint), '') is null
  then
    raise exception 'job name and fingerprint are required';
  end if;

  insert into public.pipeline_alerts (
    job_name,
    severity,
    fingerprint,
    message,
    details
  )
  values (
    p_job_name,
    p_severity,
    p_fingerprint,
    left(p_message, 1000),
    coalesce(p_details, '{}'::jsonb)
  )
  on conflict (job_name, fingerprint)
    where resolved_at is null
  do update set
    severity = excluded.severity,
    message = excluded.message,
    details = excluded.details,
    last_seen_at = now()
  returning alert_id into recorded_id;

  return jsonb_build_object('alert_id', recorded_id, 'recorded', true);
end;
$$;

create or replace function public.fn_resolve_pipeline_alert(
  p_job_name text,
  p_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_count integer;
begin
  update public.pipeline_alerts
  set resolved_at = now(),
      last_seen_at = now()
  where job_name = p_job_name
    and fingerprint = p_fingerprint
    and resolved_at is null;
  get diagnostics resolved_count = row_count;
  return jsonb_build_object('resolved', resolved_count);
end;
$$;

revoke all on function public.fn_upsert_forecast_daily(jsonb)
  from public, anon, authenticated;
revoke all on function public.fn_upsert_model_registry(jsonb)
  from public, anon, authenticated;
revoke all on function public.fn_activate_model_task(
  text, text, text, uuid, boolean
) from public, anon, authenticated;
revoke all on function public.fn_record_pipeline_alert(
  text, text, text, text, jsonb
) from public, anon, authenticated;
revoke all on function public.fn_resolve_pipeline_alert(
  text, text
) from public, anon, authenticated;
grant execute on function public.fn_upsert_forecast_daily(jsonb)
  to service_role;
grant execute on function public.fn_upsert_model_registry(jsonb)
  to service_role;
grant execute on function public.fn_activate_model_task(
  text, text, text, uuid, boolean
) to service_role;
grant execute on function public.fn_record_pipeline_alert(
  text, text, text, text, jsonb
) to service_role;
grant execute on function public.fn_resolve_pipeline_alert(
  text, text
) to service_role;
