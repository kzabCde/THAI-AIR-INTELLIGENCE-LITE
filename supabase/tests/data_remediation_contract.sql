-- Production data-remediation contract checks.
-- Read-only assertions: raise on contract drift; do not modify data.

-- 1) Trusted hourly sources only.
do $$
begin
  if exists (
    select 1
    from public.training_daily_summary_v2 v
    where exists (
      select 1
      from unnest(v.trusted_sources) s
      where lower(s) not in ('open-meteo', 'waqi', 'air4thai', 'openaq')
    )
  ) then
    raise exception 'training_daily_summary_v2 exposes a source outside the explicit trusted allowlist';
  end if;
end;
$$;

-- 2) Known repaired day must be complete and visible to both training views.
do $$
begin
  if (select count(*) from public.daily_summary where date = '2026-07-28' and hours_available = 24) <> 20 then
    raise exception '2026-07-28 daily_summary contract failed';
  end if;
  if (select count(*) from public.training_daily_summary_v2 where date = '2026-07-28') <> 20 then
    raise exception '2026-07-28 missing from training_daily_summary_v2';
  end if;
  if (select count(*) from public.training_daily_summary_v3 where date = '2026-07-28') <> 20 then
    raise exception '2026-07-28 missing from training_daily_summary_v3';
  end if;
end;
$$;

-- 3) No duplicate province/date rows in canonical training view.
do $$
begin
  if exists (
    select province_id, date
    from public.training_daily_summary_v3
    group by province_id, date
    having count(*) > 1
  ) then
    raise exception 'training_daily_summary_v3 contains duplicate province/date rows';
  end if;
end;
$$;

-- 4) No active model may include hotspot/FRP in daily-pooled-v1.
do $$
begin
  if exists (
    select 1
    from public.model_registry
    where is_active
      and feature_version = 'daily-pooled-v1'
      and (
        coalesce(feature_schema::text, '') ~* 'hotspot_count'
        or coalesce(feature_schema::text, '') ~* 'total_frp'
      )
  ) then
    raise exception 'daily-pooled-v1 unexpectedly contains hotspot/FRP';
  end if;
end;
$$;

-- 5) Trusted FIRMS view must never expose synthetic/mock/demo rows.
do $$
begin
  if exists (
    select 1 from public.observed_hotspot_daily_v1
    where lower(source) <> 'firms-viirs'
  ) then
    raise exception 'observed_hotspot_daily_v1 contains a non-FIRMS source';
  end if;
end;
$$;

-- 6) Canonical historical archive remains immutable in shape/coverage.
do $$
begin
  if (select count(*) from public.training_daily_archive_v1) <> 21580 then
    raise exception 'training_daily_archive_v1 row count changed';
  end if;
  if (select count(distinct province_id) from public.training_daily_archive_v1) <> 20 then
    raise exception 'training_daily_archive_v1 province coverage changed';
  end if;
  if (select min(date) from public.training_daily_archive_v1) <> '2022-08-05'::date
     or (select max(date) from public.training_daily_archive_v1) <> '2025-07-18'::date then
    raise exception 'training_daily_archive_v1 date coverage changed';
  end if;
end;
$$;

-- 7) Production training preparation is DB-only by lineage contract.
do $$
begin
  if exists (
    select 1
    from public.training_daily_summary_v3
    where data_origin not in (
      'supabase-trusted-hourly-v2',
      'supabase-open-meteo-cams-historical-weather-archive'
    )
  ) then
    raise exception 'training_daily_summary_v3 contains an unexpected data_origin';
  end if;
end;
$$;

-- 8) Current feature version remains unchanged.
do $$
begin
  if exists (
    select 1
    from public.model_registry
    where is_active
      and feature_version is distinct from 'daily-pooled-v1'
      and task_type in ('regression','classification')
  ) then
    raise exception 'active production ML feature version changed unexpectedly';
  end if;
end;
$$;
