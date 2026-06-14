import "server-only";

import { ISAN_PROVINCES } from "@/lib/isan";
import type { TablesInsert } from "@/lib/supabase/database.types";
import { getServiceSupabase, getSupabase, isSupabaseConfigured } from "./_db";
import { getDailyHistory } from "./daily-summary.service";
import { getLatestAir } from "./air-quality.service";
import type { ForecastPoint, ProvinceForecast } from "./types";

export const FORECAST_MODEL = "ewma-diurnal-v1";
export const FORECAST_HORIZON_HOURS = 168;
const FORECAST_HORIZON_DAYS = 7;

/** Diurnal PM2.5 multiplier — higher overnight/early morning, lower midday. */
function diurnal(hour: number): number {
  // Smooth curve peaking ~07:00 and ~20:00, trough ~14:00.
  const morning = Math.exp(-((hour - 7) ** 2) / 12);
  const evening = Math.exp(-((hour - 20) ** 2) / 16);
  return 1 + 0.18 * (morning + 0.7 * evening) - 0.08;
}

function linregSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (values[i] - meanY);
    den += (i - meanX) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

/**
 * Generate a PM2.5 forecast from recent daily history. Pure / deterministic so
 * it can run both on-the-fly (read path) and in the cron job (write path).
 */
export function buildForecast(
  provinceId: string,
  dailyMeans: number[],
  current: number | null,
  generatedAt: Date = new Date(),
): ProvinceForecast {
  const recent = dailyMeans.slice(-14).filter((v) => Number.isFinite(v));
  const base =
    current ??
    (recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 20);
  const slope = recent.length >= 4 ? linregSlope(recent) : 0;

  const daily: ForecastPoint[] = [];
  for (let d = 1; d <= FORECAST_HORIZON_DAYS; d++) {
    // Damp the trend so long horizons regress toward the recent mean.
    const damp = Math.exp(-d / 6);
    const mean = Math.max(1, base + slope * d * damp);
    const date = new Date(generatedAt);
    date.setUTCDate(date.getUTCDate() + d);
    daily.push({
      t: date.toISOString().slice(0, 10),
      pm25: +mean.toFixed(1),
      pm25Max: +(mean * 1.4).toFixed(1),
      confidence: +Math.max(0.4, 0.92 - d * 0.07).toFixed(2),
    });
  }

  const hourly: ForecastPoint[] = [];
  for (let h = 1; h <= FORECAST_HORIZON_HOURS; h++) {
    const target = new Date(generatedAt.getTime() + h * 3600_000);
    const dayIndex = Math.min(FORECAST_HORIZON_DAYS - 1, Math.floor((h - 1) / 24));
    const dayMean = daily[dayIndex].pm25;
    const value = Math.max(1, dayMean * diurnal(target.getUTCHours()));
    hourly.push({
      t: target.toISOString(),
      pm25: +value.toFixed(1),
      confidence: +Math.max(0.35, 0.9 - (h / FORECAST_HORIZON_HOURS) * 0.55).toFixed(2),
    });
  }

  const last = daily[daily.length - 1].pm25;
  const trend = last > base + 2 ? "up" : last < base - 2 ? "down" : "flat";
  const peak = hourly.reduce<ForecastPoint | null>(
    (m, p) => (!m || p.pm25 > m.pm25 ? p : m),
    null,
  );

  return {
    provinceId,
    model: FORECAST_MODEL,
    generatedAt: generatedAt.toISOString(),
    current: current ?? +base.toFixed(1),
    hourly,
    daily,
    trend,
    peak,
  };
}

/** Get a province forecast — from stored rows if available, else computed live. */
export async function getProvinceForecast(provinceId: string): Promise<ProvinceForecast> {
  const history = await getDailyHistory(provinceId, 30);
  const dailyMeans = history.map((h) => h.pm25 ?? 0).filter((v) => v > 0);
  const latest = await getLatestAir(provinceId);
  const current = latest?.pm25 ?? null;

  if (isSupabaseConfigured) {
    const stored = await readStoredForecast(provinceId);
    if (stored) return stored;
  }
  return buildForecast(provinceId, dailyMeans, current);
}

async function readStoredForecast(provinceId: string): Promise<ProvinceForecast | null> {
  const sb = getSupabase();

  // Both tables are queried independently — sorted by forecast_at DESC so the
  // latest model batch always wins, regardless of what model_name it carries.
  const [{ data: hourly }, { data: daily }] = await Promise.all([
    sb
      .from("forecast_hourly")
      .select("target_time, pm25_forecast, forecast_at, model_name")
      .eq("province_id", provinceId)
      .order("forecast_at", { ascending: false })
      .order("target_time", { ascending: true })
      .limit(FORECAST_HORIZON_HOURS),
    sb
      .from("forecast_daily")
      .select("target_date, pm25_mean_forecast, pm25_max_forecast, model_name")
      .eq("province_id", provinceId)
      .order("forecast_at", { ascending: false })
      .order("target_date", { ascending: true })
      .limit(FORECAST_HORIZON_DAYS),
  ]);

  if (!hourly?.length) return null;
  const forecastAt = hourly[0].forecast_at;
  const modelName = hourly[0].model_name;
  const start = new Date(forecastAt).getTime();
  const hPoints: ForecastPoint[] = hourly.map((r) => {
    const dt = new Date(r.target_time).getTime();
    const hAhead = Math.max(1, (dt - start) / 3600_000);
    return {
      t: r.target_time,
      pm25: r.pm25_forecast,
      confidence: +Math.max(0.35, 0.9 - (hAhead / FORECAST_HORIZON_HOURS) * 0.55).toFixed(2),
    };
  });
  const dPoints: ForecastPoint[] = (daily ?? []).map((r, i) => ({
    t: r.target_date,
    pm25: r.pm25_mean_forecast,
    pm25Max: r.pm25_max_forecast ?? undefined,
    confidence: +Math.max(0.4, 0.92 - (i + 1) * 0.07).toFixed(2),
  }));

  const current = hPoints[0]?.pm25 ?? null;
  const last = dPoints[dPoints.length - 1]?.pm25 ?? current ?? 0;
  const base = current ?? 0;
  const peak = hPoints.reduce<ForecastPoint | null>((m, p) => (!m || p.pm25 > m.pm25 ? p : m), null);

  return {
    provinceId,
    model: modelName,
    generatedAt: forecastAt,
    current,
    hourly: hPoints,
    daily: dPoints,
    trend: last > base + 2 ? "up" : last < base - 2 ? "down" : "flat",
    peak,
  };
}

/** Cron entrypoint: regenerate and persist forecasts for every province. */
export async function generateAndStoreForecasts(): Promise<number> {
  if (!isSupabaseConfigured) return 0;
  const sb = getServiceSupabase();
  const generatedAt = new Date();
  const hourlyRows: TablesInsert<"forecast_hourly">[] = [];
  const dailyRows: TablesInsert<"forecast_daily">[] = [];

  for (const province of ISAN_PROVINCES) {
    const history = await getDailyHistory(province.id, 30);
    const means = history.map((h) => h.pm25 ?? 0).filter((v) => v > 0);
    const latest = await getLatestAir(province.id);
    const f = buildForecast(province.id, means, latest?.pm25 ?? null, generatedAt);
    for (const p of f.hourly) {
      hourlyRows.push({
        province_id: province.id,
        forecast_at: f.generatedAt,
        target_time: p.t,
        pm25_forecast: p.pm25,
        model_name: FORECAST_MODEL,
      });
    }
    for (const p of f.daily) {
      dailyRows.push({
        province_id: province.id,
        forecast_at: f.generatedAt,
        target_date: p.t,
        pm25_mean_forecast: p.pm25,
        pm25_max_forecast: p.pm25Max ?? null,
        model_name: FORECAST_MODEL,
      });
    }
  }

  await sb.from("forecast_hourly").upsert(hourlyRows, {
    onConflict: "province_id,forecast_at,target_time,model_name",
  });
  await sb.from("forecast_daily").upsert(dailyRows, {
    onConflict: "province_id,forecast_at,target_date,model_name",
  });
  return hourlyRows.length + dailyRows.length;
}
