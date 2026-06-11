/** Centralized React Query keys — keeps cache invalidation consistent. */
export const queryKeys = {
  overview: ["overview"] as const,
  provinces: ["provinces"] as const,
  airQuality: (province?: string, hours?: number) =>
    ["air-quality", province ?? "all", hours ?? null] as const,
  weather: (province?: string, hours?: number) =>
    ["weather", province ?? "all", hours ?? null] as const,
  hotspots: (province?: string) => ["hotspots", province ?? "all"] as const,
  forecast: (province: string) => ["forecast", province] as const,
  history: (province: string, days: number) => ["history", province, days] as const,
  analytics: (province: string, range: number) => ["analytics", province, range] as const,
  systemStatus: ["system-status"] as const,
};

/** Maps a changed Supabase table/view to the query keys that should be invalidated. */
export const TABLE_INVALIDATIONS: Record<string, string[]> = {
  air_quality_hourly: ["overview", "air-quality", "history", "analytics"],
  air_quality_latest: ["overview", "air-quality"],
  weather_hourly: ["overview", "weather"],
  weather_latest: ["overview", "weather"],
  hotspot_daily: ["overview", "hotspots"],
  daily_summary: ["history", "analytics", "forecast"],
  forecast_hourly: ["forecast"],
  forecast_daily: ["forecast"],
  sync_state: ["system-status"],
  cron_log: ["system-status"],
};
