import "server-only";

import { getSupabase, isSupabaseConfigured } from "./_db";

export type AnalyticsFilter = {
  provinceId?: string; // omit / "all" → whole region
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
};

export type AnalyticsSeriesPoint = { date: string; pm25: number; aqi: number; samples: number };

export type AnalyticsResult = {
  series: AnalyticsSeriesPoint[];
  stats: {
    avg: number;
    max: number;
    min: number;
    exceedanceDays: number; // days over Thai 24h standard (37.5 µg/m³)
    days: number;
  };
};

const THAI_PM25_STANDARD = 37.5;

/** Daily PM2.5/AQI series for a province or the whole region, with summary stats. */
export async function getAnalytics(filter: AnalyticsFilter): Promise<AnalyticsResult> {
  const empty: AnalyticsResult = {
    series: [],
    stats: { avg: 0, max: 0, min: 0, exceedanceDays: 0, days: 0 },
  };
  if (!isSupabaseConfigured) return empty;

  let query = getSupabase()
    .from("daily_summary")
    .select("date, pm25_mean, aqi_mean, province_id")
    .gte("date", filter.from)
    .lte("date", filter.to)
    .order("date", { ascending: true });

  const single = filter.provinceId && filter.provinceId !== "all";
  if (single) query = query.eq("province_id", filter.provinceId!);

  const { data, error } = await query;
  if (error) throw error;

  // Aggregate by date (average across provinces when region-wide).
  const buckets = new Map<string, { pm: number; aqi: number; n: number }>();
  for (const r of data ?? []) {
    const b = buckets.get(r.date) ?? { pm: 0, aqi: 0, n: 0 };
    b.pm += r.pm25_mean ?? 0;
    b.aqi += r.aqi_mean ?? 0;
    b.n += 1;
    buckets.set(r.date, b);
  }
  const series: AnalyticsSeriesPoint[] = [...buckets.entries()]
    .map(([date, b]) => ({
      date,
      pm25: b.n ? +(b.pm / b.n).toFixed(1) : 0,
      aqi: b.n ? Math.round(b.aqi / b.n) : 0,
      samples: b.n,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const values = series.map((s) => s.pm25).filter((v) => v > 0);
  const stats = {
    avg: values.length ? +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(1) : 0,
    max: values.length ? +Math.max(...values).toFixed(1) : 0,
    min: values.length ? +Math.min(...values).toFixed(1) : 0,
    exceedanceDays: series.filter((s) => s.pm25 > THAI_PM25_STANDARD).length,
    days: series.length,
  };
  return { series, stats };
}
