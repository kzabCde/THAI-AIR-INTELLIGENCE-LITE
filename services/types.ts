import type { AqiBand } from "@/lib/aqi";
import type { IsanProvince } from "@/lib/isan";
import type { PM25ClassId } from "@/lib/pm25-classification";

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
  pm25P10?: number;
  pm25P50?: number;
  pm25P90?: number;
  /** Horizon confidence used by the numeric forecast visualization. */
  confidence: number;
  airQualityClass?: PM25ClassId;
  labelTh?: string;
  labelEn?: string;
  classConfidence?: number | null;
  probabilities?: Record<PM25ClassId, number>;
  regressionDerivedClass?: PM25ClassId;
  classifierPredictedClass?: PM25ClassId | null;
  classAgreement?: boolean | null;
  classificationSource?: string;
  fallbackUsed?: boolean;
  fallbackReason?: string | null;
  horizonDays?: number;
  horizonReliability?:
    | "validated_d1"
    | "experimental_recursive"
    | "legacy_unverified_d1"
    | "legacy_unverified"
    | "typescript_fallback";
  experimental?: boolean;
  uncertaintyMethod?: string | null;
};

export type ForecastModelInfo = {
  name: string;
  runId: string | null;
  eligible: boolean;
  trainedAt: string | null;
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
  dataFreshness: string | null;
  featureVersion: string | null;
  models: {
    regression: ForecastModelInfo;
    classification: ForecastModelInfo | null;
  };
  consistency: {
    regressionDerivedClass: PM25ClassId | null;
    classifierPredictedClass: PM25ClassId | null;
    agreement: boolean | null;
  };
  fallback: {
    used: boolean;
    source: string | null;
    reason: string | null;
  };
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

/** Public-facing status for an active model. Training metrics stay in Python output. */
export type ModelStatus = {
  modelName: string;
  provinceId: string;
  taskType: "regression" | "classification";
  trainedAt: string;
  eligible: boolean;
};
