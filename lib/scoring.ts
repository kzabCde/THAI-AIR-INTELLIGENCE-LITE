import type { RiskLevel } from "@/types/air";

export function riskLevelFromPm25(pm25: number): RiskLevel {
  if (pm25 <= 25) return "Excellent";
  if (pm25 <= 50) return "Good";
  if (pm25 <= 75) return "Moderate";
  if (pm25 <= 100) return "Unhealthy Sensitive";
  if (pm25 <= 150) return "Unhealthy";
  return "Hazardous";
}

export function estimateAqi(pm25: number): number {
  return Math.round(pm25 * 4);
}

export function adjustedRiskPm25(basePm25: number, humidity: number, wind: number, hotspotDelta: number, risingTrend: boolean): number {
  let score = basePm25;
  if (humidity >= 75) score += 6;
  if (wind <= 2) score += 8;
  if (hotspotDelta > 1) score += 10;
  if (risingTrend) score += 8;
  return Math.max(1, Number(score.toFixed(1)));
}
