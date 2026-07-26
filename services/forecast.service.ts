import "server-only";

import { ISAN_PROVINCES } from "@/lib/isan";
import {
  normalizeClassProbabilities,
  pm25ClassDefinition,
  pm25ClassForValue,
  type PM25ClassId,
} from "@/lib/pm25-classification";
import type { TablesInsert } from "@/lib/supabase/database.types";
import { getServiceSupabase, getSupabase, isSupabaseConfigured } from "./_db";
import { getDailyHistory } from "./daily-summary.service";
import { getLatestAir } from "./air-quality.service";
import type { ForecastPoint, ProvinceForecast } from "./types";

export const FORECAST_MODEL = "ewma-diurnal-v1";
export const FORECAST_HORIZON_HOURS = 168;
const FORECAST_HORIZON_DAYS = 7;
const HORIZON_RELIABILITY_VALUES = new Set([
  "validated_d1",
  "experimental_recursive",
  "legacy_unverified_d1",
  "legacy_unverified",
  "typescript_fallback",
]);

function normalizeHorizonReliability(
  value: string | null,
  horizonDays: number,
): ForecastPoint["horizonReliability"] {
  if (value && HORIZON_RELIABILITY_VALUES.has(value)) {
    return value as ForecastPoint["horizonReliability"];
  }
  return horizonDays === 1 ? "legacy_unverified_d1" : "legacy_unverified";
}

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
    const classId = pm25ClassForValue(mean);
    const definition = pm25ClassDefinition(classId);
    daily.push({
      t: date.toISOString().slice(0, 10),
      pm25: +mean.toFixed(1),
      pm25Max: +(mean * 1.4).toFixed(1),
      pm25P10: +Math.max(0, mean * 0.75).toFixed(1),
      pm25P50: +mean.toFixed(1),
      pm25P90: +(mean * 1.4).toFixed(1),
      confidence: +Math.max(0.4, 0.92 - d * 0.07).toFixed(2),
      airQualityClass: classId,
      labelTh: definition.labelTh,
      labelEn: definition.labelEn,
      classConfidence: null,
      probabilities: Object.fromEntries(
        [1, 2, 3, 4, 5].map((id) => [id, id === classId ? 1 : 0]),
      ) as Record<PM25ClassId, number>,
      regressionDerivedClass: classId,
      classifierPredictedClass: null,
      classAgreement: null,
      classificationSource: "regression_threshold",
      fallbackUsed: true,
      fallbackReason: "typescript_forecast_fallback",
      horizonDays: d,
      horizonReliability: "typescript_fallback",
      experimental: true,
      uncertaintyMethod: "uncalibrated_typescript_fallback",
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
    dataFreshness: null,
    featureVersion: null,
    models: {
      regression: {
        name: FORECAST_MODEL,
        runId: null,
        eligible: false,
        trainedAt: null,
      },
      classification: null,
    },
    consistency: {
      regressionDerivedClass: daily[0]?.regressionDerivedClass ?? null,
      classifierPredictedClass: null,
      agreement: null,
    },
    fallback: {
      used: true,
      source: "regression_threshold",
      reason: "typescript_forecast_fallback",
    },
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
  const [{ data: hourlyRaw }, { data: dailyRaw }, { data: modelRows }] = await Promise.all([
    sb
      .from("forecast_hourly")
      .select("target_time, pm25_forecast, forecast_at, model_name")
      .eq("province_id", provinceId)
      .order("forecast_at", { ascending: false })
      .order("target_time", { ascending: true })
      .limit(FORECAST_HORIZON_HOURS),
    sb
      .from("forecast_daily")
      .select(
        "target_date,pm25_mean_forecast,pm25_max_forecast,pm25_p10_forecast,pm25_p50_forecast,pm25_p90_forecast,forecast_at,model_name,regression_model_name,regression_run_id,regression_derived_class,classifier_predicted_class,displayed_class,class_label_th,class_label_en,classifier_model_name,classifier_run_id,confidence,class_probabilities,class_agreement,classification_source,fallback_reason,data_freshness,feature_version,forecast_horizon_days,horizon_reliability,is_experimental,uncertainty_method",
      )
      .eq("province_id", provinceId)
      .order("forecast_at", { ascending: false })
      .order("target_date", { ascending: true })
      .limit(FORECAST_HORIZON_DAYS),
    sb
      .from("model_registry")
      .select("task_type,model_name,run_id,eligibility_status,trained_at")
      .eq("province_id", provinceId)
      .eq("is_active", true),
  ]);

  // forecast_daily is the source of truth for the ML pipeline. Pick exactly
  // one newest daily batch and only use hourly rows from that same forecast_at;
  // never pad a short latest batch with rows from older forecast_at values.
  const daily = (dailyRaw ?? []).filter((r) => r.forecast_at === dailyRaw?.[0]?.forecast_at);
  if (!daily.length && !hourlyRaw?.length) return null;

  const forecastAt = daily[0]?.forecast_at ?? hourlyRaw![0].forecast_at;
  const hourly = (hourlyRaw ?? []).filter((r) => r.forecast_at === forecastAt);
  const modelName = daily[0]?.model_name ?? hourly[0]?.model_name ?? FORECAST_MODEL;
  const regressionRegistry = modelRows?.find((row) => row.task_type === "regression");
  const classificationRegistry = modelRows?.find((row) => row.task_type === "classification");
  const start = new Date(forecastAt).getTime();
  const dPoints: ForecastPoint[] = daily.map((r, i) => {
    const regressionClass = (
      r.regression_derived_class ?? pm25ClassForValue(r.pm25_mean_forecast)
    ) as PM25ClassId;
    const displayedClass = (r.displayed_class ?? regressionClass) as PM25ClassId;
    const definition = pm25ClassDefinition(displayedClass);
    const probabilities = normalizeClassProbabilities(r.class_probabilities)
      ?? Object.fromEntries(
        [1, 2, 3, 4, 5].map((id) => [id, id === displayedClass ? 1 : 0]),
      ) as Record<PM25ClassId, number>;
    const usesDirectClassifier = Boolean(
      classificationRegistry?.eligibility_status
        && r.classifier_model_name
        && r.classification_source === "active_classifier",
    );
    return {
      t: r.target_date,
      pm25: r.pm25_mean_forecast,
      pm25Max: r.pm25_max_forecast ?? undefined,
      pm25P10: r.pm25_p10_forecast ?? undefined,
      pm25P50: r.pm25_p50_forecast ?? undefined,
      pm25P90: r.pm25_p90_forecast ?? undefined,
      confidence: +Math.max(0.4, 0.92 - (i + 1) * 0.07).toFixed(2),
      airQualityClass: displayedClass,
      labelTh: r.class_label_th ?? definition.labelTh,
      labelEn: r.class_label_en ?? definition.labelEn,
      classConfidence: r.confidence != null ? Number(r.confidence) : null,
      probabilities,
      regressionDerivedClass: regressionClass,
      classifierPredictedClass: r.classifier_predicted_class as PM25ClassId | null,
      classAgreement: r.class_agreement,
      classificationSource: usesDirectClassifier
        ? "active_classifier"
        : "regression_threshold",
      fallbackUsed: !usesDirectClassifier,
      fallbackReason: usesDirectClassifier
        ? null
        : (r.fallback_reason ?? "classifier_not_active"),
      horizonDays: r.forecast_horizon_days ?? i + 1,
      horizonReliability: normalizeHorizonReliability(
        r.horizon_reliability,
        r.forecast_horizon_days ?? i + 1,
      ),
      experimental: r.is_experimental ?? (
        (r.forecast_horizon_days ?? i + 1) !== 1
      ),
      uncertaintyMethod: r.uncertainty_method,
    };
  });
  const hPoints: ForecastPoint[] = hourly.length
    ? hourly.map((r) => {
        const dt = new Date(r.target_time).getTime();
        const hAhead = Math.max(1, (dt - start) / 3600_000);
        return {
          t: r.target_time,
          pm25: r.pm25_forecast,
          confidence: +Math.max(0.35, 0.9 - (hAhead / FORECAST_HORIZON_HOURS) * 0.55).toFixed(2),
        };
      })
    : dPoints.flatMap((d, dayIndex) => Array.from({ length: 24 }, (_, hourIndex) => {
        const hAhead = dayIndex * 24 + hourIndex + 1;
        const target = new Date(start + hAhead * 3600_000);
        return {
          t: target.toISOString(),
          pm25: +Math.max(1, d.pm25 * diurnal(target.getUTCHours())).toFixed(1),
          confidence: +Math.max(0.35, 0.9 - (hAhead / FORECAST_HORIZON_HOURS) * 0.55).toFixed(2),
        };
      }));

  const current = hPoints[0]?.pm25 ?? null;
  const last = dPoints[dPoints.length - 1]?.pm25 ?? current ?? 0;
  const base = current ?? 0;
  const peak = hPoints.reduce<ForecastPoint | null>((m, p) => (!m || p.pm25 > m.pm25 ? p : m), null);
  const newest = daily[0];
  const hasDirectClassification = Boolean(
    classificationRegistry?.eligibility_status
      && newest?.classifier_model_name
      && newest?.classification_source === "active_classifier",
  );

  return {
    provinceId,
    model: modelName,
    generatedAt: forecastAt,
    current,
    hourly: hPoints,
    daily: dPoints,
    trend: last > base + 2 ? "up" : last < base - 2 ? "down" : "flat",
    peak,
    dataFreshness: newest?.data_freshness ?? null,
    featureVersion: newest?.feature_version ?? null,
    models: {
      regression: {
        name: newest?.regression_model_name ?? modelName,
        runId: newest?.regression_run_id ?? regressionRegistry?.run_id ?? null,
        eligible: regressionRegistry?.eligibility_status ?? true,
        trainedAt: regressionRegistry?.trained_at ?? null,
      },
      classification: newest?.classifier_model_name || classificationRegistry
        ? {
            name: newest?.classifier_model_name
              ?? classificationRegistry!.model_name,
            runId: newest?.classifier_run_id
              ?? classificationRegistry?.run_id
              ?? null,
            eligible: classificationRegistry?.eligibility_status ?? false,
            trainedAt: classificationRegistry?.trained_at ?? null,
          }
        : null,
    },
    consistency: {
      regressionDerivedClass: dPoints[0]?.regressionDerivedClass ?? null,
      classifierPredictedClass: dPoints[0]?.classifierPredictedClass ?? null,
      agreement: dPoints[0]?.classAgreement ?? null,
    },
    fallback: {
      used: !hasDirectClassification,
      source: hasDirectClassification ? "active_classifier" : "regression_threshold",
      reason: hasDirectClassification
        ? null
        : (dPoints[0]?.fallbackReason ?? "classifier_not_active"),
    },
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
      const classId = pm25ClassForValue(p.pm25);
      const definition = pm25ClassDefinition(classId);
      dailyRows.push({
        province_id: province.id,
        forecast_at: f.generatedAt,
        target_date: p.t,
        pm25_mean_forecast: p.pm25,
        pm25_max_forecast: p.pm25Max ?? null,
        pm25_p10_forecast: p.pm25P10 ?? null,
        pm25_p50_forecast: p.pm25P50 ?? p.pm25,
        pm25_p90_forecast: p.pm25P90 ?? p.pm25Max ?? null,
        model_name: FORECAST_MODEL,
        regression_model_name: FORECAST_MODEL,
        regression_derived_class: classId,
        displayed_class: classId,
        class_label_th: definition.labelTh,
        class_label_en: definition.labelEn,
        class_probabilities: Object.fromEntries(
          [1, 2, 3, 4, 5].map((id) => [id, id === classId ? 1 : 0]),
        ),
        classification_source: "regression_threshold",
        fallback_used: true,
        fallback_reason: "typescript_forecast_fallback",
        forecast_horizon_days: p.horizonDays ?? null,
        horizon_reliability: "typescript_fallback",
        is_experimental: true,
        uncertainty_method: p.uncertaintyMethod ?? "uncalibrated_typescript_fallback",
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
