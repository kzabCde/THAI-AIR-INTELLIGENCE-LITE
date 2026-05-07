import { RISK_COPY, SENSITIVE_GROUPS } from "@/lib/risk/recommendations";
import { type RiskInput, type RiskResult, type RiskLevelKey } from "@/lib/risk/types";

const clamp100 = (n: number) => Math.max(0, Math.min(100, n));
const normalize = (value: number | undefined, max: number) => (value === undefined ? undefined : clamp100((value / max) * 100));

export function calculateRisk(input: RiskInput): RiskResult {
  const pm25Score = normalize(input.pm25, 150);
  const pm10Score = normalize(input.pm10, 250);
  const aqiScore = normalize(input.aqi, 300);

  const windPenalty = input.windSpeed === undefined ? undefined : clamp100((15 - Math.min(input.windSpeed, 15)) * 4.5);
  const humidityPenalty = input.humidity === undefined ? undefined : clamp100((Math.max(0, input.humidity - 65) / 35) * 25);
  const temperaturePenalty = input.temperature === undefined ? undefined : clamp100((Math.max(0, input.temperature - 34) / 10) * 20);
  const weatherPenalty = [windPenalty, humidityPenalty, temperaturePenalty].filter((n): n is number => n !== undefined).reduce((a, b) => a + b, 0) / Math.max(1, [windPenalty, humidityPenalty, temperaturePenalty].filter((x) => x !== undefined).length);

  const stalePenalty = input.isStale ? 100 : 0;
  const hotspotPenalty = input.hotspotRisk ? clamp100(input.hotspotRisk) : 0;

  const weighted = (pm25Score ?? 0) * 0.45 + (pm10Score ?? 0) * 0.2 + (aqiScore ?? 0) * 0.2 + (weatherPenalty ?? 0) * 0.1 + stalePenalty * 0.05 + hotspotPenalty * 0.05;
  const riskScore = clamp100(Number(weighted.toFixed(1)));

  let riskLevel: RiskLevelKey = "low";
  if (riskScore > 80) riskLevel = "severe";
  else if (riskScore > 60) riskLevel = "high";
  else if (riskScore > 40) riskLevel = "sensitive";
  else if (riskScore > 20) riskLevel = "moderate";

  const missing = [input.pm25, input.pm10, input.aqi, input.windSpeed, input.humidity, input.temperature].filter((v) => v === undefined).length;
  const confidence = clamp100(100 - missing * 10 - (input.isStale ? 20 : 0));
  const explanation = missing > 0
    ? `ความเสี่ยงคำนวณจากข้อมูลบางส่วน (${missing} ฟิลด์ไม่ครบ) โดย PM2.5 มีน้ำหนักสูงสุดและสภาพอากาศถูกนำมาปรับคะแนน`
    : "ความเสี่ยงคำนวณจาก PM2.5, PM10, AQI, สภาพอากาศ และสถานะความใหม่ของข้อมูล โดย PM2.5 มีน้ำหนักสูงสุด";

  return {
    riskScore,
    riskLevel,
    thaiLabel: RISK_COPY[riskLevel].thaiLabel,
    englishLabel: RISK_COPY[riskLevel].englishLabel,
    explanation,
    recommendations: RISK_COPY[riskLevel].recommendations,
    sensitiveGroups: SENSITIVE_GROUPS,
    outdoorAdvice: RISK_COPY[riskLevel].outdoorAdvice,
    confidence,
  };
}

export const RISK_EXAMPLES = {
  low: calculateRisk({ pm25: 12, pm10: 24, aqi: 35, windSpeed: 18, humidity: 50, temperature: 30, isStale: false }),
  high: calculateRisk({ pm25: 78, pm10: 122, aqi: 175, windSpeed: 4, humidity: 82, temperature: 36, isStale: true }),
};
