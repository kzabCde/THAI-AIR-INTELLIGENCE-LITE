import type { AqiBand } from "@/lib/aqi";
import type { IsanProvince } from "@/lib/isan";

/** Current snapshot for one province, merged across all measurement domains. */
export type ProvinceSnapshot = {
  province: IsanProvince;
  observedAt: string | null;
  pm25: number | null;
  pm10: number | null;
  aqi: number | null;
  category: string | null;
  band: AqiBand;
  temperature: number | null;
  humidity: number | null;
  windSpeed: number | null;
  precipitation: number | null;
  hotspotCount: number;
  /** `date` of the most recent hotspot record used for `hotspotCount` above —
   *  may lag well behind `observedAt` when fire detection has gone quiet. */
  hotspotDate: string | null;
  /** PM2.5 change vs. previous day mean (µg/m³). */
  pm25Delta: number | null;
};

export type RegionOverview = {
  observedAt: string | null;
  provinceCount: number;
  avgPm25: number;
  avgAqi: number;
  worst: ProvinceSnapshot | null;
  best: ProvinceSnapshot | null;
  totalHotspots: number;
  /** Most recent `date` across all hotspot records used above — may lag `observedAt`
   *  by days if satellite fire detection has gone quiet (e.g. off-season). */
  hotspotDate: string | null;
  /** Count of provinces in each AQI level (0–5). */
  levelCounts: number[];
  snapshots: ProvinceSnapshot[];
};

export type TimePoint = {
  t: string; // ISO timestamp or date
  pm25: number | null;
  pm10?: number | null;
  aqi?: number | null;
  temperature?: number | null;
  humidity?: number | null;
  windSpeed?: number | null;
  windDirection?: number | null;
  pressure?: number | null;
  precipitation?: number | null;
  cloudCover?: number | null;
  visibility?: number | null;
  hotspots?: number | null;
};

export type ForecastPoint = {
  t: string;
  pm25: number;
  pm25Max?: number;
  confidence: number; // 0–1
};

export type ProvinceForecast = {
  provinceId: string;
  model: string;
  generatedAt: string;
  current: number | null;
  hourly: ForecastPoint[]; // up to 168h
  daily: ForecastPoint[]; // up to 7d
  trend: "up" | "down" | "flat";
  peak: ForecastPoint | null;
};

export type Paginated<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};

export type SyncJob = {
  jobName: string;
  source: string | null;
  schedule: string | null;
  status: string;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  recordsProcessed: number;
  errorMsg: string | null;
};

export type CronLog = {
  id: number;
  jobName: string;
  startedAt: string | null;
  finishedAt: string | null;
  status: string;
  durationMs: number | null;
  recordsIn: number | null;
  recordsOut: number | null;
  errorMsg: string | null;
};

export type DataFreshness = {
  table: string;
  latest: string | null;
  rowCount: number | null;
};

export type ModelMetric = {
  modelName: string;
  provinceId: string;
  trainedAt: string;
  trainingRows: number | null;
  mae: number | null;
  rmse: number | null;
  r2: number | null;
  isActive: boolean;
  modelParams: Record<string, unknown> | null;
};
