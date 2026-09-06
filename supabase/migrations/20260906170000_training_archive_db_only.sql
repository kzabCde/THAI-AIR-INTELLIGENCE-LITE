-- Persist the historical Open-Meteo training archive in Supabase and make the
-- monthly retraining path capable of reading the entire multi-season dataset
-- from the database only.
--
-- The existing training_daily_archive_v1 table was created before the actual
-- archive payload contract was finalized. The v5.6.4 monthly archive cache
-- contains the features used by the production model, but it does not contain
-- PM10, temperature extrema, wind extrema/direction, or cloud-cover daily
-- aggregates. Those fields are therefore optional for archive rows and remain
-- available for future enrichment.

alter table public.training_daily_archive_v1
  alter column pm10_mean drop not null,
  alter column temp_max drop not null,
  alter column temp_min drop not null,
  alter column wind_speed_max drop not null,
  alter column wind_dir_mean drop not null,
  alter column cloud_cover_mean drop not null;

alter table public.training_daily_archive_v1
  drop constraint if exists training_daily_archive_v1_weather_model_check;

alter table public.training_daily_archive_v1
  add constraint training_daily_archive_v1_weather_model_check
  check (
    weather_model in (
      'gfs_seamless',
      'open-meteo-historical-weather'
    )
  );

comment on table public.training_daily_archive_v1 is
  'Trusted historical daily training archive persisted once in Supabase. Archive rows are never synthesized and carry request-level Open-Meteo lineage.';

comment on table public.training_archive_requests_v1 is
  'Request-level lineage for historical training archive imports, including endpoint, model, exact request parameters, response SHA-256, and fetch timestamp.';

-- Keep the public training view backward compatible while correcting the
-- historical archive origin label. Database-backed daily rows always win when
-- the same province/date exists in both sources.
create or replace view public.training_daily_summary_v3 as
select
  v2.province_id,
  v2.date,
  v2.trusted_hours,
  v2.trusted_sources,
  'supabase-trusted-hourly-v2'::text as data_origin,
  'hourly-trusted-v2'::text as lineage_version,
  null::uuid as air_request_id,
  null::uuid as weather_request_id,
  v2.trusted_observed_at as fetched_at,
  v2.pm25_mean,
  v2.pm25_lag_1d,
  v2.pm25_lag_3d,
  v2.pm25_lag_7d,
  v2.pm25_roll3,
  v2.pm25_roll7,
  v2.neighbor_pm25_avg,
  v2.regional_pm25_avg,
  v2.temp_mean,
  v2.humidity_mean,
  v2.wind_speed_mean,
  v2.precip_total,
  v2.month,
  v2.day_of_week,
  v2.is_burning_season,
  v2.is_dry_season,
  v2.pm25_max,
  v2.pm25_min,
  v2.pm25_p75,
  v2.pm25_p90,
  v2.pm10_mean,
  v2.temp_max,
  v2.temp_min,
  v2.wind_speed_max,
  v2.wind_dir_mean,
  v2.pressure_mean,
  v2.cloud_cover_mean
from public.training_daily_summary_v2 v2

union all

select
  a.province_id,
  a.date,
  a.trusted_hours::integer as trusted_hours,
  a.trusted_sources,
  'supabase-open-meteo-cams-historical-weather-archive'::text as data_origin,
  a.lineage_version,
  a.air_request_id,
  a.weather_request_id,
  a.fetched_at,
  a.pm25_mean::numeric as pm25_mean,
  null::numeric as pm25_lag_1d,
  null::numeric as pm25_lag_3d,
  null::numeric as pm25_lag_7d,
  null::numeric as pm25_roll3,
  null::numeric as pm25_roll7,
  null::numeric as neighbor_pm25_avg,
  null::numeric as regional_pm25_avg,
  a.temp_mean,
  a.humidity_mean,
  a.wind_speed_mean,
  a.precip_total,
  extract(month from a.date)::smallint as month,
  (extract(isodow from a.date)::smallint - 1)::smallint as day_of_week,
  extract(month from a.date)::integer = any(array[1,2,3,4]) as is_burning_season,
  extract(month from a.date)::integer = any(array[11,12,1,2,3,4]) as is_dry_season,
  a.pm25_max::numeric as pm25_max,
  a.pm25_min::numeric as pm25_min,
  a.pm25_p75::numeric as pm25_p75,
  a.pm25_p90::numeric as pm25_p90,
  a.pm10_mean::numeric as pm10_mean,
  a.temp_max,
  a.temp_min,
  a.wind_speed_max,
  a.wind_dir_mean,
  a.pressure_mean,
  a.cloud_cover_mean
from public.training_daily_archive_v1 a
where not exists (
  select 1
  from public.training_daily_summary_v2 v2
  where v2.province_id = a.province_id
    and v2.date = a.date
);

comment on view public.training_daily_summary_v3 is
  'Single database source of truth for PM2.5 training: persisted historical Open-Meteo archive plus trusted hourly Supabase continuation, with database rows taking precedence on overlap.';
