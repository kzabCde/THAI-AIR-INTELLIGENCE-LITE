import "server-only";

import { ISAN_PROVINCES } from "@/lib/isan";
import { pm25ToAqi, bandForPm25 } from "@/lib/aqi";
import { pm25ClassForValue, pm25ClassDefinition } from "@/lib/pm25-classification";
import { getServiceSupabase, isSupabaseConfigured } from "./_db";
import { buildForecast } from "./forecast.service";
import { getDailyHistory } from "./daily-summary.service";
import { getLatestAirByProvince } from "./air-quality.service";
import type { ForecastPoint } from "./types";

/** Summary of one province's daily forecast for the regional view. */
export type RegionalForecastEntry = {
  provinceId: string;
  nameTh: string;
  nameEn: string;
  zone: string;
  /** Current observed PM2.5 */
  currentPm25: number | null;
  currentAqi: number | null;
  /** D+1 through D+7 daily forecasts */
  daily: {
    date: string;
    pm25: number;
    aqi: number;
    labelTh: string;
    color: string;
    horizonDays: number;
  }[];
  /** Trend: up / down / flat */
  trend: "up" | "down" | "flat";
  /** Model name used */
  model: string;
  generatedAt: string;
};

export type RegionalForecastSummary = {
  entries: RegionalForecastEntry[];
  /** Regional D+1 average PM2.5 */
  avgPm25D1: number;
  avgAqiD1: number;
  /** Province with highest forecast D+1 */
  worstD1: RegionalForecastEntry | null;
  /** Province with lowest forecast D+1 */
  bestD1: RegionalForecastEntry | null;
  generatedAt: string;
};

/** Fetch all 20 provinces' forecasts for the regional dashboard. */
export async function getRegionalForecast(): Promise<RegionalForecastSummary> {
  const airMap = isSupabaseConfigured ? await getLatestAirByProvince() : new Map();

  // Try stored DB forecasts first (single query for all provinces)
  if (isSupabaseConfigured) {
    const stored = await readStoredRegionalForecast(airMap);
    if (stored) return stored;
  }

  // Fallback: compute from daily history for each province
  const entries: RegionalForecastEntry[] = [];
  for (const province of ISAN_PROVINCES) {
    const history = await getDailyHistory(province.id, 30);
    const means = history.map((h) => h.pm25 ?? 0).filter((v) => v > 0);
    const currentPm25 = airMap.get(province.id)?.pm25 ?? null;
    const forecast = buildForecast(province.id, means, currentPm25);

    entries.push(toEntry(province, forecast.daily, currentPm25, forecast.model, forecast.generatedAt));
  }

  return buildSummary(entries);
}

async function readStoredRegionalForecast(
  airMap: Map<string, { pm25: number | null; aqi: number | null; [k: string]: unknown }>,
): Promise<RegionalForecastSummary | null> {
  const sb = getServiceSupabase();

  // Get latest completed run
  const { data: runs } = await sb
    .from("forecast_runs")
    .select("run_id,forecast_at")
    .in("status", ["success", "partial"])
    .order("forecast_at", { ascending: false })
    .limit(1);

  if (!runs?.length) return null;
  const runId = runs[0].run_id;
  const forecastAt = runs[0].forecast_at;

  // Get all province daily forecasts from this run
  const { data: rows, error } = await sb
    .from("forecast_daily")
    .select(
      "province_id,target_date,pm25_mean_forecast,forecast_horizon_days,model_name,regression_derived_class,displayed_class,class_label_th",
    )
    .eq("forecast_run_id", runId)
    .order("province_id")
    .order("target_date", { ascending: true });

  if (error || !rows?.length) return null;

  // Group by province
  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = grouped.get(row.province_id) ?? [];
    list.push(row);
    grouped.set(row.province_id, list);
  }

  const entries: RegionalForecastEntry[] = ISAN_PROVINCES.map((province) => {
    const provinceRows = grouped.get(province.id) ?? [];
    const currentPm25 = airMap.get(province.id)?.pm25 ?? null;

    const daily = provinceRows.map((r) => {
      const pm25 = r.pm25_mean_forecast;
      const aqi = pm25ToAqi(pm25);
      const classId = (r.displayed_class ?? r.regression_derived_class ?? pm25ClassForValue(pm25));
      const definition = pm25ClassDefinition(classId as 1 | 2 | 3 | 4 | 5);
      const band = bandForPm25(pm25);
      return {
        date: r.target_date,
        pm25: +pm25.toFixed(1),
        aqi,
        labelTh: r.class_label_th ?? definition.labelTh,
        color: band.color,
        horizonDays: r.forecast_horizon_days ?? 1,
      };
    });

    const last = daily[daily.length - 1]?.pm25 ?? 0;
    const first = daily[0]?.pm25 ?? 0;
    const trend: "up" | "down" | "flat" = last > first + 2 ? "up" : last < first - 2 ? "down" : "flat";

    return {
      provinceId: province.id,
      nameTh: province.nameTh,
      nameEn: province.nameEn,
      zone: province.zone,
      currentPm25,
      currentAqi: currentPm25 != null ? pm25ToAqi(currentPm25) : null,
      daily,
      trend,
      model: provinceRows[0]?.model_name ?? "unknown",
      generatedAt: forecastAt,
    };
  });

  return buildSummary(entries);
}

function toEntry(
  province: (typeof ISAN_PROVINCES)[number],
  dailyPoints: ForecastPoint[],
  currentPm25: number | null,
  model: string,
  generatedAt: string,
): RegionalForecastEntry {
  const daily = dailyPoints.map((p) => {
    const band = bandForPm25(p.pm25);
    const classId = p.airQualityClass ?? pm25ClassForValue(p.pm25);
    const definition = pm25ClassDefinition(classId as 1 | 2 | 3 | 4 | 5);
    return {
      date: p.t,
      pm25: p.pm25,
      aqi: pm25ToAqi(p.pm25),
      labelTh: p.labelTh ?? definition.labelTh,
      color: band.color,
      horizonDays: p.horizonDays ?? 1,
    };
  });

  const last = daily[daily.length - 1]?.pm25 ?? 0;
  const first = daily[0]?.pm25 ?? 0;
  const trend: "up" | "down" | "flat" = last > first + 2 ? "up" : last < first - 2 ? "down" : "flat";

  return {
    provinceId: province.id,
    nameTh: province.nameTh,
    nameEn: province.nameEn,
    zone: province.zone,
    currentPm25,
    currentAqi: currentPm25 != null ? pm25ToAqi(currentPm25) : null,
    daily,
    trend,
    model,
    generatedAt,
  };
}

function buildSummary(entries: RegionalForecastEntry[]): RegionalForecastSummary {
  const d1Values = entries
    .map((e) => e.daily[0]?.pm25)
    .filter((v): v is number => v != null && v > 0);

  const avgPm25D1 = d1Values.length
    ? +(d1Values.reduce((a, b) => a + b, 0) / d1Values.length).toFixed(1)
    : 0;

  const sorted = [...entries]
    .filter((e) => e.daily[0]?.pm25 != null)
    .sort((a, b) => (b.daily[0]?.pm25 ?? 0) - (a.daily[0]?.pm25 ?? 0));

  return {
    entries,
    avgPm25D1,
    avgAqiD1: pm25ToAqi(avgPm25D1),
    worstD1: sorted[0] ?? null,
    bestD1: sorted[sorted.length - 1] ?? null,
    generatedAt: entries[0]?.generatedAt ?? new Date().toISOString(),
  };
}
