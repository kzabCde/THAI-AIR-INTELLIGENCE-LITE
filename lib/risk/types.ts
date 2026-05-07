export type RiskInput = {
  pm25?: number;
  pm10?: number;
  aqi?: number;
  windSpeed?: number;
  humidity?: number;
  temperature?: number;
  isStale?: boolean;
  hotspotRisk?: number;
};

export type RiskLevelKey = "low" | "moderate" | "sensitive" | "high" | "severe";

export type RiskResult = {
  riskScore: number;
  riskLevel: RiskLevelKey;
  thaiLabel: string;
  englishLabel: string;
  explanation: string;
  recommendations: string[];
  sensitiveGroups: string[];
  outdoorAdvice: string;
  confidence: number;
};
