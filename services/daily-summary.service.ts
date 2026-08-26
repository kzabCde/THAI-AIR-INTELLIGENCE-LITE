import "server-only";

import { ISAN_PROVINCES } from "@/lib/isan";
import type { Tables } from "@/lib/supabase/database.types";
import {
  dateDaysAgo,
  getServiceSupabase,
  isServiceSupabaseConfigured,
  isSupabaseConfigured,
} from "./_db";

export type DailyRow = Tables<"trusted_daily_metrics_v1">;

export type DailyPoint = {
  date: string;
  pm25: number | null;
  pm25Max: number | null;
  pm25Min: number | null;
  aqi: number | null;
  temp: number | null;
  tempMax: number | null;
  tempMin: number | null;
  humidity: number | null;
  wind: number | null;
  windMax: number | null;
  windDir: number | null;
  hotspots: number | null;
  hoursAvailable: number | null;
  isBurningSeason: boolean | null;
  trustedSources: string[];
  trustedObservedAt: string | null;
};

const DAILY_POINT_COLUMNS =
  "date, pm25_mean, pm25_max, pm25_min, aqi_mean, temp_mean, temp_max, temp_min, humidity_mean, wind_speed_mean, wind_speed_max, wind_dir_mean, hotspot_count, hours_available, is_burning_season, trusted_sources, trusted_observed_at" as const;

function toPoint(r: Partial<DailyRow> & { date: string }): DailyPoint {
  return {
    date: r.date,
    pm25: r.pm25_mean ?? null,
    pm25Max: r.pm25_max ?? null,
    pm25Min: r.pm25_min ?? null,
    aqi: r.aqi_mean ?? null,
    temp: r.temp_mean ?? null,
    tempMax: r.temp_max ?? null,
    tempMin: r.temp_min ?? null,
    humidity: r.humidity_mean ?? null,
    wind: r.wind_speed_mean ?? null,
    windMax: r.wind_speed_max ?? null,
    windDir: r.wind_dir_mean ?? null,
    hotspots: r.hotspot_count ?? null,
    hoursAvailable: r.hours_available ?? null,
    isBurningSeason: r.is_burning_season ?? null,
    trustedSources: r.trusted_sources ?? [],
    trustedObservedAt: r.trusted_observed_at ?? null,
  };
}

/** Daily history for a province over the past `days` (7 / 30 / 90 …). */
export async function getDailyHistory(provinceId: string, days: number): Promise<DailyPoint[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await getServiceSupabase()
    .from("trusted_daily_metrics_v1")
    .select(DAILY_POINT_COLUMNS)
    .eq("province_id", provinceId)
    .gte("date", dateDaysAgo(days))
    .order("date", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toPoint);
}

function shiftDateKey(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day));
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

/** The newest fully completed business date in Asia/Bangkok. */
export function getLatestCompletedBangkokDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const today = `${value("year")}-${value("month")}-${value("day")}`;
  return shiftDateKey(today, -1);
}

/**
 * Calendar-accurate history anchored to the newest trusted business date.
 *
 * This differs from `getDailyHistory`, which is intentionally relative to the
 * current clock for lightweight page/forecast reads. Trend comparisons must
 * remain stable when an upstream feed is late, so the requested window ends at
 * the newest row available for that province instead of `new Date()`.
 */
export async function getTrendHistory(
  provinceId: string,
  calendarDays = 730,
  throughDate = getLatestCompletedBangkokDate(),
): Promise<DailyPoint[]> {
  if (!isServiceSupabaseConfigured) return [];

  const days = Math.min(730, Math.max(1, Math.trunc(calendarDays)));
  const client = getServiceSupabase();
  const fromDate = shiftDateKey(throughDate, -(days - 1));
  const { data, error } = await client
    .from("trusted_daily_metrics_v1")
    .select(DAILY_POINT_COLUMNS)
    .eq("province_id", provinceId)
    .gte("date", fromDate)
    .lte("date", throughDate)
    .order("date", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(toPoint);
}

const PAGE_SIZE = 1_000;
const MAX_ROWS = 20_000;

/**
 * Regional (all-Isan) trend history: fetches every province for the given
 * date range and aggregates into per-date averages. Each DailyPoint carries
 * the cross-province average for that day. pm25Min/pm25Max carry the
 * province-level min/max on that date (not hourly).
 */
export async function getRegionalTrendHistory(
  calendarDays = 730,
  throughDate = getLatestCompletedBangkokDate(),
): Promise<DailyPoint[]> {
  if (!isServiceSupabaseConfigured) return [];

  const days = Math.min(730, Math.max(1, Math.trunc(calendarDays)));
  const client = getServiceSupabase();
  const fromDate = shiftDateKey(throughDate, -(days - 1));

  // Paginate to avoid PostgREST 1000-row default limit
  const rows: Array<Partial<DailyRow> & { date: string }> = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
    const { data, error } = await client
      .from("trusted_daily_metrics_v1")
      .select(DAILY_POINT_COLUMNS)
      .gte("date", fromDate)
      .lte("date", throughDate)
      .order("date", { ascending: true })
      .order("province_id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE_SIZE) break;
  }

  // Aggregate by date → cross-province averages
  type Bucket = {
    pm25Sum: number; pm25N: number;
    pm25MaxArr: number[]; pm25MinArr: number[];
    aqiSum: number; aqiN: number;
    tempSum: number; tempN: number;
    tempMaxArr: number[]; tempMinArr: number[];
    humiditySum: number; humidityN: number;
    windSum: number; windN: number;
    windMaxArr: number[];
    windDirSum: number; windDirN: number;
    hotspotsSum: number; hotspotsN: number;
    hoursSum: number; hoursN: number;
    isBurningSeason: boolean | null;
    trustedSourcesSet: Set<string>;
    trustedObservedAt: string | null;
  };

  const buckets = new Map<string, Bucket>();

  for (const r of rows) {
    let b = buckets.get(r.date);
    if (!b) {
      b = {
        pm25Sum: 0, pm25N: 0,
        pm25MaxArr: [], pm25MinArr: [],
        aqiSum: 0, aqiN: 0,
        tempSum: 0, tempN: 0,
        tempMaxArr: [], tempMinArr: [],
        humiditySum: 0, humidityN: 0,
        windSum: 0, windN: 0,
        windMaxArr: [],
        windDirSum: 0, windDirN: 0,
        hotspotsSum: 0, hotspotsN: 0,
        hoursSum: 0, hoursN: 0,
        isBurningSeason: null,
        trustedSourcesSet: new Set(),
        trustedObservedAt: null,
      };
      buckets.set(r.date, b);
    }

    if (r.pm25_mean != null) { b.pm25Sum += r.pm25_mean; b.pm25N++; }
    if (r.pm25_max != null) b.pm25MaxArr.push(r.pm25_max);
    if (r.pm25_min != null) b.pm25MinArr.push(r.pm25_min);
    if (r.aqi_mean != null) { b.aqiSum += r.aqi_mean; b.aqiN++; }
    if (r.temp_mean != null) { b.tempSum += r.temp_mean; b.tempN++; }
    if (r.temp_max != null) b.tempMaxArr.push(r.temp_max);
    if (r.temp_min != null) b.tempMinArr.push(r.temp_min);
    if (r.humidity_mean != null) { b.humiditySum += r.humidity_mean; b.humidityN++; }
    if (r.wind_speed_mean != null) { b.windSum += r.wind_speed_mean; b.windN++; }
    if (r.wind_speed_max != null) b.windMaxArr.push(r.wind_speed_max);
    if (r.wind_dir_mean != null) { b.windDirSum += r.wind_dir_mean; b.windDirN++; }
    if (r.hotspot_count != null) { b.hotspotsSum += r.hotspot_count; b.hotspotsN++; }
    if (r.hours_available != null) { b.hoursSum += r.hours_available; b.hoursN++; }
    if (r.is_burning_season != null) b.isBurningSeason = r.is_burning_season;
    for (const src of (r.trusted_sources as string[]) ?? []) b.trustedSourcesSet.add(src);
    if (r.trusted_observed_at != null) {
      if (!b.trustedObservedAt || r.trusted_observed_at > b.trustedObservedAt) {
        b.trustedObservedAt = r.trusted_observed_at as string;
      }
    }
  }

  const rd = (v: number, d = 1) => +(v.toFixed(d));

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, b]): DailyPoint => ({
      date,
      pm25: b.pm25N ? rd(b.pm25Sum / b.pm25N) : null,
      pm25Max: b.pm25MaxArr.length ? Math.max(...b.pm25MaxArr) : null,
      pm25Min: b.pm25MinArr.length ? Math.min(...b.pm25MinArr) : null,
      aqi: b.aqiN ? Math.round(b.aqiSum / b.aqiN) : null,
      temp: b.tempN ? rd(b.tempSum / b.tempN) : null,
      tempMax: b.tempMaxArr.length ? Math.max(...b.tempMaxArr) : null,
      tempMin: b.tempMinArr.length ? Math.min(...b.tempMinArr) : null,
      humidity: b.humidityN ? rd(b.humiditySum / b.humidityN) : null,
      wind: b.windN ? rd(b.windSum / b.windN) : null,
      windMax: b.windMaxArr.length ? Math.max(...b.windMaxArr) : null,
      windDir: b.windDirN ? rd(b.windDirSum / b.windDirN) : null,
      hotspots: b.hotspotsN ? b.hotspotsSum : null,
      hoursAvailable: b.hoursN ? Math.round(b.hoursSum / b.hoursN) : null,
      isBurningSeason: b.isBurningSeason,
      trustedSources: [...b.trustedSourcesSet],
      trustedObservedAt: b.trustedObservedAt,
    }));
}

/** Previous-day mean PM2.5 per province (used for the current-day delta). */
export async function getYesterdayMeanByProvince(): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (!isSupabaseConfigured) return result;
  const { data, error } = await getServiceSupabase()
    .from("trusted_daily_metrics_v1")
    .select("province_id, date, pm25_mean")
    .gte("date", dateDaysAgo(3))
    .order("date", { ascending: false });
  if (error) throw error;
  // Take the second-most-recent day per province as "yesterday".
  const seen = new Map<string, number>();
  for (const r of data ?? []) {
    const n = seen.get(r.province_id) ?? 0;
    if (n === 1 && r.pm25_mean != null) result.set(r.province_id, r.pm25_mean);


    seen.set(r.province_id, n + 1);
  }
  return result;
}

export type MonthlyPoint = { month: string; pm25: number; aqi: number; samples: number };

/** Monthly average PM2.5/AQI for a province across the full history. */
export async function getMonthlyAverages(provinceId: string, months = 12): Promise<MonthlyPoint[]> {
  if (!isSupabaseConfigured) return [];
  const since = new Date();
  since.setUTCMonth(since.getUTCMonth() - months);
  const { data, error } = await getServiceSupabase()
    .from("trusted_daily_metrics_v1")
    .select("date, pm25_mean, aqi_mean")
    .eq("province_id", provinceId)
    .gte("date", since.toISOString().slice(0, 10))
    .order("date", { ascending: true });
  if (error) throw error;
  const buckets = new Map<string, { pm: number; aqi: number; n: number }>();
  for (const r of data ?? []) {
    const key = r.date.slice(0, 7);
    const b = buckets.get(key) ?? { pm: 0, aqi: 0, n: 0 };
    b.pm += r.pm25_mean ?? 0;
    b.aqi += r.aqi_mean ?? 0;
    b.n += 1;
    buckets.set(key, b);
  }
  return [...buckets.entries()].map(([month, b]) => ({
    month,
    pm25: b.n ? +(b.pm / b.n).toFixed(1) : 0,
    aqi: b.n ? Math.round(b.aqi / b.n) : 0,
    samples: b.n,
  }));
}

export type SeasonPoint = { season: string; seasonTh: string; pm25: number; samples: number };

/**
 * Seasonal comparison. Isan has a pronounced burning/dry season (Nov–Apr) that
 * dominates PM2.5, so we bucket by meteorological season.
 */
export async function getSeasonalAverages(provinceId: string): Promise<SeasonPoint[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await getServiceSupabase()
    .from("trusted_daily_metrics_v1")
    .select("month, pm25_mean")
    .eq("province_id", provinceId);
  if (error) throw error;
  const defs: { key: string; th: string; months: number[] }[] = [
    { key: "Burning (Dry)", th: "ฤดูเผา (แล้ง)", months: [11, 12, 1, 2, 3, 4] },
    { key: "Hot", th: "ฤดูร้อน", months: [3, 4, 5] },
    { key: "Rainy", th: "ฤดูฝน", months: [6, 7, 8, 9, 10] },
  ];
  return defs.map((d) => {
    const rows = (data ?? []).filter((r) => r.month != null && d.months.includes(r.month));
    const sum = rows.reduce((a, r) => a + (r.pm25_mean ?? 0), 0);
    return {
      season: d.key,
      seasonTh: d.th,
      pm25: rows.length ? +(sum / rows.length).toFixed(1) : 0,
      samples: rows.length,
    };
  });
}

export type ProvinceTrendSummary = {
  provinceId: string;
  nameTh: string;
  nameEn: string;
  avgPm25: number;
  maxPm25: number;
  exceedanceDays: number;
  cleanDays: number;
  observedDays: number;
};

/** Fetch ranking summary of all 20 provinces for the given timeframe. */
export async function getRegionalProvinceRankings(
  days = 180,
  throughDate = getLatestCompletedBangkokDate(),
): Promise<ProvinceTrendSummary[]> {
  if (!isServiceSupabaseConfigured) return [];
  const client = getServiceSupabase();
  const fromDate = shiftDateKey(throughDate, -(days - 1));

  // Query daily metrics for all provinces in the requested range
  const { data, error } = await client
    .from("trusted_daily_metrics_v1")
    .select("province_id, pm25_mean, pm25_max")
    .gte("date", fromDate)
    .lte("date", throughDate);

  if (error) throw error;

  const map = new Map<string, { sum: number; count: number; max: number; exceed: number; clean: number }>();
  for (const r of data ?? []) {
    if (!r.province_id || r.pm25_mean == null) continue;
    const cur = map.get(r.province_id) ?? { sum: 0, count: 0, max: 0, exceed: 0, clean: 0 };
    cur.sum += r.pm25_mean;
    cur.count += 1;
    if (r.pm25_mean > cur.max) cur.max = r.pm25_mean;
    if (r.pm25_mean > 37.5) cur.exceed += 1;
    if (r.pm25_mean <= 15.0) cur.clean += 1;
    map.set(r.province_id, cur);
  }

  const result: ProvinceTrendSummary[] = [];
  for (const p of ISAN_PROVINCES) {
    const stat = map.get(p.id);
    if (!stat || stat.count === 0) continue;
    result.push({
      provinceId: p.id,
      nameTh: p.nameTh,
      nameEn: p.nameEn,
      avgPm25: +(stat.sum / stat.count).toFixed(1),
      maxPm25: +stat.max.toFixed(1),
      exceedanceDays: stat.exceed,
      cleanDays: stat.clean,
      observedDays: stat.count,
    });
  }

  // Sort ascending by avgPm25 (cleanest to highest)
  result.sort((a, b) => a.avgPm25 - b.avgPm25);
  return result;
}
