export function pm25Color(pm25: number) {
  if (pm25 <= 12) return "#16a34a";
  if (pm25 <= 35.4) return "#ca8a04";
  if (pm25 <= 55.4) return "#ea580c";
  if (pm25 <= 150.4) return "#ef4444";
  if (pm25 <= 250.4) return "#9333ea";
  return "#881337";
}

export function riskColor(pm25: number): string {
  if (pm25 <= 12) return "#00e400";
  if (pm25 <= 35.4) return "#ffff00";
  if (pm25 <= 55.4) return "#ff7e00";
  if (pm25 <= 150.4) return "#ff0000";
  if (pm25 <= 250.4) return "#8f3f97";
  return "#7e0023";
}

export function riskBg(pm25: number): string {
  if (pm25 <= 12) return "bg-green-100 text-green-800";
  if (pm25 <= 35.4) return "bg-yellow-100 text-yellow-800";
  if (pm25 <= 55.4) return "bg-orange-100 text-orange-800";
  if (pm25 <= 150.4) return "bg-red-100 text-red-800";
  if (pm25 <= 250.4) return "bg-purple-100 text-purple-800";
  return "bg-rose-200 text-rose-900";
}

export function riskLabel(pm25: number): string {
  if (pm25 <= 12) return "ดีมาก";
  if (pm25 <= 35.4) return "ดี";
  if (pm25 <= 55.4) return "ปานกลาง";
  if (pm25 <= 150.4) return "ไม่ดีต่อสุขภาพ";
  if (pm25 <= 250.4) return "อันตราย";
  return "วิกฤต";
}

export function riskLabelEn(pm25: number): string {
  if (pm25 <= 12) return "Good";
  if (pm25 <= 35.4) return "Moderate";
  if (pm25 <= 55.4) return "USG";
  if (pm25 <= 150.4) return "Unhealthy";
  if (pm25 <= 250.4) return "Very Unhealthy";
  return "Hazardous";
}

export const AQI_BANDS = [
  { max: 12, label: "ดีมาก (Good)", color: "#00e400", textColor: "#000" },
  { max: 35.4, label: "ดี (Moderate)", color: "#ca8a04", textColor: "#fff" },
  { max: 55.4, label: "ปานกลาง (USG)", color: "#ff7e00", textColor: "#fff" },
  { max: 150.4, label: "ไม่ดีต่อสุขภาพ", color: "#ff0000", textColor: "#fff" },
  { max: 250.4, label: "อันตรายมาก", color: "#8f3f97", textColor: "#fff" },
  { max: Infinity, label: "วิกฤต (Hazardous)", color: "#7e0023", textColor: "#fff" },
];
