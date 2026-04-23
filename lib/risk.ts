import { adjustedRiskPm25, riskLevelFromPm25 } from "@/lib/scoring";

export { adjustedRiskPm25, riskLevelFromPm25 };

export type ThaiRiskLevel = "ต่ำ" | "ปานกลาง" | "สูง" | "วิกฤต";

export function explainThaiRisk(pm25: number, humidity: number, wind: number, hotspots: number): { level: ThaiRiskLevel; reasons: string[] } {
  const reasons: string[] = [];

  if (pm25 <= 37) reasons.push("ค่าฝุ่นยังอยู่ในช่วงที่ควบคุมได้");
  if (pm25 > 37) reasons.push("ค่าฝุ่นเกินเกณฑ์มาตรฐานรายวัน");
  if (humidity > 75) reasons.push("ความชื้นสูงทำให้ฝุ่นแขวนลอยสะสม");
  if (wind < 2) reasons.push("ลมอ่อนระบายฝุ่นได้ช้า");
  if (hotspots > 25) reasons.push("พบจุดความร้อนจำนวนมากในพื้นที่ใกล้เคียง");

  const riskScore = pm25 + (humidity > 75 ? 8 : 0) + (wind < 2 ? 12 : 0) + Math.min(20, hotspots / 2);
  if (riskScore < 35) return { level: "ต่ำ", reasons };
  if (riskScore < 65) return { level: "ปานกลาง", reasons };
  if (riskScore < 100) return { level: "สูง", reasons };
  return { level: "วิกฤต", reasons };
}
