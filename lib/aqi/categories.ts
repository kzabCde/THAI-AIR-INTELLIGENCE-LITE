export type AQICategoryKey = "good" | "moderate" | "usg" | "unhealthy" | "very-unhealthy" | "hazardous";

export type AQICategory = {
  key: AQICategoryKey;
  label: string;
  thaiLabel: string;
  technicalLabel: string;
  shortLabel: string;
  min: number;
  max: number;
  recommendationTh: string;
  severityScore: number;
};

export const AQI_CATEGORIES: AQICategory[] = [
  { key: "good", label: "Good", thaiLabel: "ดี", technicalLabel: "AQI 0-50", shortLabel: "Good", min: 0, max: 50, recommendationTh: "คุณภาพอากาศดี เหมาะกับกิจกรรมกลางแจ้ง", severityScore: 10 },
  { key: "moderate", label: "Moderate", thaiLabel: "ปานกลาง", technicalLabel: "AQI 51-100", shortLabel: "Moderate", min: 51, max: 100, recommendationTh: "ประชาชนทั่วไปทำกิจกรรมได้ กลุ่มเสี่ยงควรติดตามอาการ", severityScore: 30 },
  { key: "usg", label: "Unhealthy for Sensitive Groups", thaiLabel: "เริ่มมีผลกระทบต่อกลุ่มเสี่ยง", technicalLabel: "AQI 101-150", shortLabel: "USG", min: 101, max: 150, recommendationTh: "กลุ่มเสี่ยงควรลดเวลานอกอาคาร และสวมหน้ากาก", severityScore: 50 },
  { key: "unhealthy", label: "Unhealthy", thaiLabel: "มีผลกระทบต่อสุขภาพ", technicalLabel: "AQI 151-200", shortLabel: "Unhealthy", min: 151, max: 200, recommendationTh: "ทุกคนควรลดกิจกรรมกลางแจ้งและป้องกันระบบทางเดินหายใจ", severityScore: 70 },
  { key: "very-unhealthy", label: "Very Unhealthy", thaiLabel: "มีผลกระทบมาก", technicalLabel: "AQI 201-300", shortLabel: "Very Unhealthy", min: 201, max: 300, recommendationTh: "หลีกเลี่ยงกิจกรรมกลางแจ้ง อยู่ในอาคารที่มีอากาศกรอง", severityScore: 90 },
  { key: "hazardous", label: "Hazardous", thaiLabel: "อันตราย", technicalLabel: "AQI 301+", shortLabel: "Hazardous", min: 301, max: Number.POSITIVE_INFINITY, recommendationTh: "ภาวะอันตราย ควรหลีกเลี่ยงนอกอาคารอย่างเคร่งครัด", severityScore: 100 },
];

export function getAQICategory(aqi: number): AQICategory {
  if (!Number.isFinite(aqi)) return AQI_CATEGORIES[0];
  return AQI_CATEGORIES.find((category) => aqi >= category.min && aqi <= category.max) ?? AQI_CATEGORIES[AQI_CATEGORIES.length - 1];
}

export function formatAQI(aqi: number | null): string {
  if (aqi === null || Number.isNaN(aqi)) return "-";
  return Math.round(aqi).toString();
}
