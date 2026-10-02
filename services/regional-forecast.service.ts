import "server-only";

import { ISAN_PROVINCES, type IsanZone } from "@/lib/isan";
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
  zone: IsanZone;
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
    isExperimental: boolean;
    horizonReliability: string | null;
  }[];
  /** Trend: up / down / flat */
  trend: "up" | "down" | "flat";
  /** Model name used */
  model: string;
  usesRegressionFallback: boolean;
  classificationSource: string | null;
  generatedAt: string;
};

export type RegionalForecastDay = {
  horizonDays: number;
  date: string;
  avgPm25: number;
  avgAqi: number;
  maxPm25: number;
  provinceCount: number;
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
  sourceAsOf: string | null;
  runStatus: string;
  coverage: {
    provincesWithForecast: number;
    completeProvinces: number;
    totalProvinces: number;
    forecastCells: number;
    expectedCells: number;
  };
  dailyAverages: RegionalForecastDay[];
  modelBreakdown: { model: string; provinces: number }[];
  fallbackProvinces: string[];
  classificationSource: string | null;
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

  return buildSummary(entries, {
    generatedAt: entries[0]?.generatedAt ?? new Date().toISOString(),
    sourceAsOf: null,
    runStatus: "computed_fallback",
  });
}

async function readStoredRegionalForecast(
  airMap: Map<string, { pm25: number | null; aqi: number | null; [k: string]: unknown }>,
): Promise<RegionalForecastSummary | null> {
  const sb = getServiceSupabase();

  // Get latest completed run
  const { data: runs } = await sb
    .from("forecast_runs")
    .select("run_id,forecast_at,status,source_as_of")
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
      "province_id,target_date,pm25_mean_forecast,forecast_horizon_days,model_name,regression_model_name,regression_derived_class,displayed_class,class_label_th,is_experimental,horizon_reliability,fallback_reason,classification_source",
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
    const provinceRows = (grouped.get(province.id) ?? [])
      .filter((row) => Number.isFinite(row.pm25_mean_forecast) && row.pm25_mean_forecast >= 0)
      .sort((a, b) => (a.forecast_horizon_days ?? 99) - (b.forecast_horizon_days ?? 99));
    const currentPm25 = airMap.get(province.id)?.pm25 ?? null;

    // A run should contain one row per horizon. Keep the first row for each
    // horizon so a malformed/duplicated batch cannot distort regional KPIs.
    const uniqueRows = [...new Map(
      provinceRows.map((row) => [row.forecast_horizon_days ?? 1, row]),
    ).values()];

    const daily = uniqueRows.map((r) => {
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
        isExperimental: r.is_experimental,
        horizonReliability: r.horizon_reliability,
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
      model: provinceRows[0]?.regression_model_name ?? provinceRows[0]?.model_name ?? "unknown",
      usesRegressionFallback: provinceRows.some(
        (row) => row.fallback_reason === "mean_regression_fallback" || row.model_name === "recent-mean-v1",
      ),
      classificationSource: provinceRows[0]?.classification_source ?? null,
      generatedAt: forecastAt,
    };
  });

  return buildSummary(entries, {
    generatedAt: forecastAt,
    sourceAsOf: runs[0].source_as_of,
    runStatus: runs[0].status,
  });
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
      isExperimental: p.experimental ?? (p.horizonDays ?? 1) > 1,
      horizonReliability: p.horizonReliability ?? "typescript_fallback",
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
    usesRegressionFallback: true,
    classificationSource: dailyPoints[0]?.classificationSource ?? "regression_threshold",
    generatedAt,
  };
}

function buildSummary(
  entries: RegionalForecastEntry[],
  meta: { generatedAt: string; sourceAsOf: string | null; runStatus: string },
): RegionalForecastSummary {
  const d1Values = entries
    .map((entry) => entry.daily.find((day) => day.horizonDays === 1)?.pm25)
    .filter((v): v is number => v != null && Number.isFinite(v) && v >= 0);

  const avgPm25D1 = d1Values.length
    ? +(d1Values.reduce((a, b) => a + b, 0) / d1Values.length).toFixed(1)
    : 0;

  const sorted = [...entries]
    .filter((entry) => {
      const value = entry.daily.find((day) => day.horizonDays === 1)?.pm25;
      return value != null && Number.isFinite(value);
    })
    .sort((a, b) => (
      b.daily.find((day) => day.horizonDays === 1)?.pm25 ?? 0
    ) - (
      a.daily.find((day) => day.horizonDays === 1)?.pm25 ?? 0
    ));

  const d1Aqis = d1Values.map(pm25ToAqi);
  const avgAqiD1 = d1Aqis.length
    ? Math.round(d1Aqis.reduce((sum, value) => sum + value, 0) / d1Aqis.length)
    : 0;

  const dailyAverages: RegionalForecastDay[] = Array.from({ length: 7 }, (_, index) => {
    const horizonDays = index + 1;
    const points = entries
      .map((entry) => entry.daily.find((day) => day.horizonDays === horizonDays))
      .filter((day): day is NonNullable<typeof day> => Boolean(day));
    const values = points.map((point) => point.pm25);
    const avgPm25 = values.length
      ? +(values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)
      : 0;
    return {
      horizonDays,
      date: points[0]?.date ?? "",
      avgPm25,
      avgAqi: values.length
        ? Math.round(values.map(pm25ToAqi).reduce((sum, value) => sum + value, 0) / values.length)
        : 0,
      maxPm25: values.length ? +Math.max(...values).toFixed(1) : 0,
      provinceCount: values.length,
    };
  });

  const modelCounts = new Map<string, number>();
  for (const entry of entries.filter((item) => item.daily.length > 0)) {
    modelCounts.set(entry.model, (modelCounts.get(entry.model) ?? 0) + 1);
  }

  const forecastCells = entries.reduce((sum, entry) => sum + entry.daily.length, 0);
  const classifications = entries
    .map((entry) => entry.classificationSource)
    .filter((source): source is string => Boolean(source));

  return {
    entries,
    avgPm25D1,
    avgAqiD1,
    worstD1: sorted[0] ?? null,
    bestD1: sorted[sorted.length - 1] ?? null,
    generatedAt: meta.generatedAt,
    sourceAsOf: meta.sourceAsOf,
    runStatus: meta.runStatus,
    coverage: {
      provincesWithForecast: entries.filter((entry) => entry.daily.length > 0).length,
      completeProvinces: entries.filter((entry) => entry.daily.length === 7).length,
      totalProvinces: ISAN_PROVINCES.length,
      forecastCells,
      expectedCells: ISAN_PROVINCES.length * 7,
    },
    dailyAverages,
    modelBreakdown: [...modelCounts.entries()]
      .map(([model, provinces]) => ({ model, provinces }))
      .sort((a, b) => b.provinces - a.provinces),
    fallbackProvinces: entries
      .filter((entry) => entry.usesRegressionFallback)
      .map((entry) => entry.nameTh),
    classificationSource: classifications[0] ?? null,
  };
}
