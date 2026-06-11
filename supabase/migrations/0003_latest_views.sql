-- air_quality_latest: latest PM2.5/AQI reading per province
-- Deduplicates air_quality_hourly to one row per province_id (most recent observed_at).
-- Used by client-side services and Realtime subscriptions.
CREATE OR REPLACE VIEW public.air_quality_latest AS
SELECT DISTINCT ON (province_id)
  id,
  province_id,
  observed_at,
  pm25,
  pm10,
  aqi,
  aqi_category,
  source,
  station_id,
  created_at
FROM public.air_quality_hourly
ORDER BY province_id, observed_at DESC;

-- weather_latest: latest weather reading per province
CREATE OR REPLACE VIEW public.weather_latest AS
SELECT DISTINCT ON (province_id)
  id,
  province_id,
  observed_at,
  temperature,
  humidity,
  wind_speed,
  wind_direction,
  precipitation,
  pressure,
  cloud_cover,
  visibility,
  source,
  created_at
FROM public.weather_hourly
ORDER BY province_id, observed_at DESC;

-- Grant read access to the anonymous role (consistent with RLS on base tables).
GRANT SELECT ON public.air_quality_latest TO anon;
GRANT SELECT ON public.weather_latest TO anon;
