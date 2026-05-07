export type Severity = "good" | "moderate" | "unhealthy" | "hazardous";

export interface NavItem {
  href: string;
  label: string;
}

export interface ProvinceSummary {
  id: string;
  nameTh: string;
  aqi?: number;
  pm25?: number;
  severity?: Severity;
  updatedAt?: string;
}

export interface ForecastPoint {
  ts: string;
  pm25: number;
  confidence?: number;
}
