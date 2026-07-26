import { createClient } from "@supabase/supabase-js";

const FETCH_TIMEOUT_MS = 20_000;
const FAILURE_FINGERPRINT = "scheduled-job-failure";
const US_AQI_BREAKPOINTS = [
  [0, 12, 0, 50],
  [12.1, 35.4, 51, 100],
  [35.5, 55.4, 101, 150],
  [55.5, 150.4, 151, 200],
  [150.5, 250.4, 201, 300],
  [250.5, 500.4, 301, 500],
];

function pm25ToAqi(pm: number): number {
  for (const [cl, ch, il, ih] of US_AQI_BREAKPOINTS) {
    if (pm >= cl && pm <= ch) {
      return Math.round(((ih - il) / (ch - cl)) * (pm - cl) + il);
    }
  }
  return pm > 500.4 ? 500 : 0;
}

function aqiCategory(aqi: number): string {
  if (aqi <= 50) return "Good";
  if (aqi <= 100) return "Moderate";
  if (aqi <= 150) return "Unhealthy for Sensitive Groups";
  if (aqi <= 200) return "Unhealthy";
  if (aqi <= 300) return "Very Unhealthy";
  return "Hazardous";
}

function haversine(la1: number, lo1: number, la2: number, lo2: number): number {
  const radiusKm = 6371;
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(la2 - la1);
  const dLon = toRad(lo2 - lo1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(la1)) *
      Math.cos(toRad(la2)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * radiusKm * Math.asin(Math.sqrt(a));
}

async function fetchWithRetry(
  url: string,
  attempts = 3,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`Upstream HTTP ${response.status}`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(500 * 2 ** (attempt - 1), 2_000)),
        );
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

async function setSyncState(
  sb: ReturnType<typeof createClient>,
  job: string,
  status: string,
  records: number,
  durationMs: number,
  error: string | null,
): Promise<void> {
  const patch: Record<string, unknown> = {
    status,
    last_run_at: new Date().toISOString(),
    records_processed: records,
    duration_ms: durationMs,
    error_msg: error,
    updated_at: new Date().toISOString(),
  };
  if (status === "success") patch.last_success_at = new Date().toISOString();
  await sb.from("sync_state").update(patch).eq("job_name", job);
}

async function updatePipelineAlert(
  sb: ReturnType<typeof createClient>,
  errors: string[],
  details: Record<string, unknown>,
): Promise<void> {
  if (errors.length) {
    await sb.rpc("fn_record_pipeline_alert", {
      p_job_name: "daily-sync",
      p_fingerprint: FAILURE_FINGERPRINT,
      p_message: errors.slice(0, 5).join(" | "),
      p_severity: "warning",
      p_details: details,
    });
  } else {
    await sb.rpc("fn_resolve_pipeline_alert", {
      p_job_name: "daily-sync",
      p_fingerprint: FAILURE_FINGERPRINT,
    });
  }
}

Deno.serve(async () => {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return Response.json(
      { ok: false, error: "Supabase service role is not configured" },
      { status: 500 },
    );
  }
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  try {
    const { data: provinces, error: provinceError } = await supabase
      .from("isan_provinces")
      .select("province_id, lat, lon");
    if (provinceError) throw provinceError;
    if (!provinces?.length) throw new Error("no provinces");

    let airRows = 0;
    let weatherRows = 0;
    const errors: string[] = [];
    const airStartedMs = Date.now();

    for (const province of provinces) {
      try {
        const airUrl =
          "https://air-quality-api.open-meteo.com/v1/air-quality" +
          `?latitude=${province.lat}&longitude=${province.lon}` +
          "&hourly=pm2_5,pm10&past_days=2&forecast_days=0&timezone=UTC";
        const airResponse = await fetchWithRetry(airUrl);
        const airJson = await airResponse.json();
        const airTimes = airJson?.hourly?.time ?? [];
        const pm25 = airJson?.hourly?.pm2_5 ?? [];
        const pm10 = airJson?.hourly?.pm10 ?? [];
        const airBatch = airTimes
          .map((observedAt: string, index: number) => {
            const value = pm25[index];
            if (value == null) return null;
            const aqi = pm25ToAqi(value);
            return {
              province_id: province.province_id,
              observed_at: new Date(`${observedAt}Z`).toISOString(),
              pm25: value,
              pm10: pm10[index] ?? null,
              aqi,
              aqi_category: aqiCategory(aqi),
              station_id: null,
              source: "open-meteo",
            };
          })
          .filter(Boolean);
        if (airBatch.length) {
          const { error } = await supabase
            .from("air_quality_hourly")
            .upsert(airBatch, {
              onConflict: "province_id,observed_at,source",
            });
          if (error) errors.push(`air ${province.province_id}: ${error.message}`);
          else airRows += airBatch.length;
        }
      } catch (error) {
        errors.push(`air ${province.province_id}: ${String(error)}`);
      }
      try {
        const weatherUrl =
          "https://api.open-meteo.com/v1/forecast" +
          `?latitude=${province.lat}&longitude=${province.lon}` +
          "&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m," +
          "wind_direction_10m,surface_pressure,precipitation,cloud_cover," +
          "visibility&past_days=2&forecast_days=0&timezone=UTC";
        const weatherResponse = await fetchWithRetry(weatherUrl);
        const weatherJson = await weatherResponse.json();
        const hourly = weatherJson?.hourly ?? {};
        const weatherBatch = (hourly.time ?? [])
          .map((observedAt: string, index: number) => {
            const temperature = hourly.temperature_2m?.[index];
            if (temperature == null) return null;
            return {
              province_id: province.province_id,
              observed_at: new Date(`${observedAt}Z`).toISOString(),
              temperature,
              humidity: hourly.relative_humidity_2m?.[index] ?? null,
              wind_speed: hourly.wind_speed_10m?.[index] ?? null,
              wind_direction: hourly.wind_direction_10m?.[index] ?? null,
              pressure: hourly.surface_pressure?.[index] ?? null,
              precipitation: hourly.precipitation?.[index] ?? null,
              cloud_cover: hourly.cloud_cover?.[index] ?? null,
              visibility: hourly.visibility?.[index] ?? null,
              source: "open-meteo",
            };
          })
          .filter(Boolean);
        if (weatherBatch.length) {
          const { error } = await supabase
            .from("weather_hourly")
            .upsert(weatherBatch, {
              onConflict: "province_id,observed_at,source",
            });
          if (error) errors.push(`wx ${province.province_id}: ${error.message}`);
          else weatherRows += weatherBatch.length;
        }
      } catch (error) {
        errors.push(`wx ${province.province_id}: ${String(error)}`);
      }
    }

    const airFinishedMs = Date.now();
    await setSyncState(
      supabase,
      "pm25_sync",
      errors.some((error) => error.startsWith("air")) ? "partial" : "success",
      airRows,
      airFinishedMs - airStartedMs,
      null,
    );
    await setSyncState(
      supabase,
      "weather_sync",
      errors.some((error) => error.startsWith("wx")) ? "partial" : "success",
      weatherRows,
      airFinishedMs - airStartedMs,
      null,
    );

    const hotspotStartedMs = Date.now();
    let hotspotRows = 0;
    const firmsKey = Deno.env.get("FIRMS_MAP_KEY");
    if (firmsKey) {
      try {
        const area = "100.5,13.8,106.2,18.6";
        const firmsUrl =
          `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${firmsKey}` +
          `/VIIRS_SNPP_NRT/${area}/2`;
        const firmsResponse = await fetchWithRetry(firmsUrl);
        const csv = await firmsResponse.text();
        const lines = csv.trim().split("\n");
        const header = lines[0].split(",");
        const latitudeIndex = header.indexOf("latitude");
        const longitudeIndex = header.indexOf("longitude");
        const frpIndex = header.indexOf("frp");
        const confidenceIndex = header.indexOf("confidence");
        const dateIndex = header.indexOf("acq_date");
        const aggregates = new Map<
          string,
          {
            count: number;
            totalFrp: number;
            maxFrp: number;
            highConfidence: number;
            provinceId: string;
            date: string;
          }
        >();

        for (let index = 1; index < lines.length; index += 1) {
          const columns = lines[index].split(",");
          const latitude = Number.parseFloat(columns[latitudeIndex]);
          const longitude = Number.parseFloat(columns[longitudeIndex]);
          if (Number.isNaN(latitude) || Number.isNaN(longitude)) continue;
          const frp =
            frpIndex >= 0 ? Number.parseFloat(columns[frpIndex]) || 0 : 0;
          const confidence =
            confidenceIndex >= 0 ? columns[confidenceIndex] : "";
          const observedDate =
            dateIndex >= 0
              ? columns[dateIndex]
              : new Date().toISOString().slice(0, 10);
          let nearestProvince = "";
          let nearestDistance = Number.POSITIVE_INFINITY;
          for (const candidate of provinces) {
            const distance = haversine(
              latitude,
              longitude,
              Number(candidate.lat),
              Number(candidate.lon),
            );
            if (distance < nearestDistance) {
              nearestDistance = distance;
              nearestProvince = candidate.province_id;
            }
          }
          if (nearestDistance > 150) continue;
          const key = `${nearestProvince}|${observedDate}`;
          const current = aggregates.get(key) ?? {
            count: 0,
            totalFrp: 0,
            maxFrp: 0,
            highConfidence: 0,
            provinceId: nearestProvince,
            date: observedDate,
          };
          current.count += 1;
          current.totalFrp += frp;
          current.maxFrp = Math.max(current.maxFrp, frp);
          if (
            confidence === "h" ||
            confidence === "high" ||
            Number.parseInt(confidence, 10) >= 80
          ) {
            current.highConfidence += 1;
          }
          aggregates.set(key, current);
        }

        const hotspotBatch = [...aggregates.values()].map((value) => ({
          province_id: value.provinceId,
          date: value.date,
          hotspot_count: value.count,
          total_frp: Math.round(value.totalFrp * 100) / 100,
          max_frp: Math.round(value.maxFrp * 100) / 100,
          high_confidence_count: value.highConfidence,
          source: "firms-viirs",
        }));
        if (hotspotBatch.length) {
          const { error } = await supabase
            .from("hotspot_daily")
            .upsert(hotspotBatch, {
              onConflict: "province_id,date,source",
            });
          if (error) errors.push(`hotspot: ${error.message}`);
          else hotspotRows = hotspotBatch.length;
        }
        await setSyncState(
          supabase,
          "hotspot_sync",
          errors.some(
            (error) =>
              error.startsWith("firms") || error.startsWith("hotspot"),
          )
            ? "partial"
            : "success",
          hotspotRows,
          Date.now() - hotspotStartedMs,
          null,
        );
      } catch (error) {
        await setSyncState(
          supabase,
          "hotspot_sync",
          "error",
          0,
          Date.now() - hotspotStartedMs,
          String(error),
        );
        errors.push(`hotspot: ${String(error)}`);
      }
    } else {
      await setSyncState(
        supabase,
        "hotspot_sync",
        "skipped",
        0,
        0,
        "FIRMS_MAP_KEY not set",
      );
    }

    const { data: pipeline, error: pipelineError } =
      await supabase.rpc("fn_daily_pipeline");
    if (pipelineError) errors.push(`pipeline: ${pipelineError.message}`);

    const alertDetails = {
      air_rows: airRows,
      weather_rows: weatherRows,
      hotspot_rows: hotspotRows,
      pipeline,
    };
    await updatePipelineAlert(supabase, errors, alertDetails);
    await supabase.from("cron_log").insert({
      job_name: "daily-sync",
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      status: errors.length ? "partial" : "success",
      duration_ms: Date.now() - startedMs,
      records_in: airRows + weatherRows + hotspotRows,
      records_out:
        (pipeline?.daily_rows_built ?? 0) + (pipeline?.forecast_rows ?? 0),
      error_msg: errors.length ? errors.slice(0, 5).join(" | ") : null,
      meta: alertDetails,
    });

    return Response.json({
      ok: true,
      air_rows: airRows,
      weather_rows: weatherRows,
      hotspot_rows: hotspotRows,
      pipeline,
      errors: errors.slice(0, 10),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updatePipelineAlert(
      supabase,
      [message],
      { phase: "unhandled", started_at: startedAt },
    );
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
});
