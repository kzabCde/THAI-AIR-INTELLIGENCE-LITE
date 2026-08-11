/**
 * AQI design system — the single source of truth for PM2.5 → AQI conversion,
 * category bands, colors, and health guidance used across the whole platform.
 * Aligned with PCD Thailand 5-class PM2.5 standard.
 */

export type AqiLevel = 0 | 1 | 2 | 3 | 4 | 5;

export type AqiBand = {
  level: AqiLevel;
  category: string;
  labelEn: string;
  labelTh: string;
  aqiMax: number;
  pm25Max: number;
  color: string;
  text: string;
  bg: string;
  soft: string;
  ring: string;
  adviceTh: string;
};

export const AQI_BANDS: AqiBand[] = [
  {
    level: 0,
    category: "Very Good",
    labelEn: "Very Good",
    labelTh: "ดีมาก",
    aqiMax: 25,
    pm25Max: 15,
    color: "#16a34a",
    text: "text-emerald-700 dark:text-emerald-300",
    bg: "bg-emerald-500 text-white",
    soft: "bg-emerald-500/10 dark:bg-emerald-500/15",
    ring: "border-emerald-500/30",
    adviceTh: "คุณภาพอากาศดีมาก เหมาะกับกิจกรรมกลางแจ้งทุกประเภท",
  },
  {
    level: 1,
    category: "Good",
    labelEn: "Good",
    labelTh: "ดี",
    aqiMax: 50,
    pm25Max: 25,
    color: "#84cc16",
    text: "text-lime-700 dark:text-lime-300",
    bg: "bg-lime-500 text-white",
    soft: "bg-lime-500/10 dark:bg-lime-500/15",
    ring: "border-lime-500/30",
    adviceTh: "คุณภาพอากาศดี ทำกิจกรรมกลางแจ้งได้ตามปกติ",
  },
  {
    level: 2,
    category: "Moderate",
    labelEn: "Moderate",
    labelTh: "ปานกลาง",
    aqiMax: 100,
    pm25Max: 37.5,
    color: "#eab308",
    text: "text-yellow-700 dark:text-yellow-300",
    bg: "bg-yellow-400 text-yellow-950",
    soft: "bg-yellow-400/10 dark:bg-yellow-400/15",
    ring: "border-yellow-400/40",
    adviceTh: "คุณภาพอากาศปานกลาง กลุ่มเสี่ยงควรสังเกตอาการ",
  },
  {
    level: 3,
    category: "Unhealthy for Sensitive Groups",
    labelEn: "Unhealthy (Sensitive)",
    labelTh: "เริ่มมีผลกระทบ",
    aqiMax: 150,
    pm25Max: 75,
    color: "#f97316",
    text: "text-orange-700 dark:text-orange-300",
    bg: "bg-orange-500 text-white",
    soft: "bg-orange-500/10 dark:bg-orange-500/15",
    ring: "border-orange-500/30",
    adviceTh: "กลุ่มเสี่ยงควรลดกิจกรรมกลางแจ้งและสวมหน้ากาก",
  },
  {
    level: 4,
    category: "Unhealthy",
    labelEn: "Unhealthy",
    labelTh: "มีผลกระทบ",
    aqiMax: 500,
    pm25Max: Infinity,
    color: "#ef4444",
    text: "text-red-700 dark:text-red-300",
    bg: "bg-red-500 text-white",
    soft: "bg-red-500/10 dark:bg-red-500/15",
    ring: "border-red-500/30",
    adviceTh: "ทุกคนควรลดกิจกรรมกลางแจ้ง สวมหน้ากาก N95",
  },
];

/** US EPA PM2.5 (µg/m³) → AQI (0–500), piecewise linear. */
export function pm25ToAqi(pm25: number): number {
  const bp: Array<[number, number, number, number]> = [
    [0.0, 15.0, 0, 25],
    [15.1, 25.0, 26, 50],
    [25.1, 37.5, 51, 100],
    [37.6, 75.0, 101, 150],
    [75.1, 500.0, 151, 500],
  ];
  const c = Math.max(0, pm25);
  for (const [cLo, cHi, iLo, iHi] of bp) {
    if (c <= cHi) {
      return Math.round(((iHi - iLo) / (cHi - cLo)) * (c - cLo) + iLo);
    }
  }
  return 500;
}

export function bandForPm25(pm25: number): AqiBand {
  return AQI_BANDS.find((b) => pm25 <= b.pm25Max) ?? AQI_BANDS[AQI_BANDS.length - 1];
}

export function bandForAqi(aqi: number): AqiBand {
  return AQI_BANDS.find((b) => aqi <= b.aqiMax) ?? AQI_BANDS[AQI_BANDS.length - 1];
}

/** Resolve a band from a stored DB category string, falling back to pm25. */
export function bandForCategory(category: string | null | undefined, pm25 = 0): AqiBand {
  if (category) {
    const match = AQI_BANDS.find(
      (b) => b.category.toLowerCase() === category.toLowerCase(),
    );
    if (match) return match;
  }
  return bandForPm25(pm25);
}
