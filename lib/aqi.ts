/**
 * AQI design system — the single source of truth for PM2.5 → AQI conversion,
 * category bands, colors, and health guidance used across the whole platform.
 * Based on the US EPA PM2.5 (24h) breakpoints, matching the `pm25_to_aqi` /
 * `aqi_category` functions in the database.
 */

export type AqiLevel = 0 | 1 | 2 | 3 | 4 | 5;

export type AqiBand = {
  level: AqiLevel;
  /** Category key matching DB `aqi_category` values. */
  category: string;
  labelEn: string;
  labelTh: string;
  aqiMax: number;
  pm25Max: number;
  color: string; // solid hex for charts / markers
  text: string; // tailwind text color
  bg: string; // tailwind solid badge background
  soft: string; // tailwind translucent card background
  ring: string; // tailwind border/ring color
  adviceTh: string;
};

export const AQI_BANDS: AqiBand[] = [
  {
    level: 0,
    category: "Good",
    labelEn: "Good",
    labelTh: "ดีมาก",
    aqiMax: 50,
    pm25Max: 12,
    color: "#16a34a",
    text: "text-emerald-700 dark:text-emerald-300",
    bg: "bg-emerald-500 text-white",
    soft: "bg-emerald-500/10 dark:bg-emerald-500/15",
    ring: "border-emerald-500/30",
    adviceTh: "คุณภาพอากาศดีมาก เหมาะกับกิจกรรมกลางแจ้งทุกประเภท",
  },
  {
    level: 1,
    category: "Moderate",
    labelEn: "Moderate",
    labelTh: "ปานกลาง",
    aqiMax: 100,
    pm25Max: 35.4,
    color: "#eab308",
    text: "text-yellow-700 dark:text-yellow-300",
    bg: "bg-yellow-400 text-yellow-950",
    soft: "bg-yellow-400/10 dark:bg-yellow-400/15",
    ring: "border-yellow-400/40",
    adviceTh: "คุณภาพอากาศปานกลาง กลุ่มเสี่ยงควรสังเกตอาการ",
  },
  {
    level: 2,
    category: "Unhealthy for Sensitive Groups",
    labelEn: "Unhealthy (Sensitive)",
    labelTh: "เริ่มมีผลต่อกลุ่มเสี่ยง",
    aqiMax: 150,
    pm25Max: 55.4,
    color: "#f97316",
    text: "text-orange-700 dark:text-orange-300",
    bg: "bg-orange-500 text-white",
    soft: "bg-orange-500/10 dark:bg-orange-500/15",
    ring: "border-orange-500/30",
    adviceTh: "กลุ่มเสี่ยงควรลดกิจกรรมกลางแจ้งและสวมหน้ากาก",
  },
  {
    level: 3,
    category: "Unhealthy",
    labelEn: "Unhealthy",
    labelTh: "มีผลต่อสุขภาพ",
    aqiMax: 200,
    pm25Max: 150.4,
    color: "#ef4444",
    text: "text-red-700 dark:text-red-300",
    bg: "bg-red-500 text-white",
    soft: "bg-red-500/10 dark:bg-red-500/15",
    ring: "border-red-500/30",
    adviceTh: "ทุกคนควรลดกิจกรรมกลางแจ้ง สวมหน้ากาก N95",
  },
  {
    level: 4,
    category: "Very Unhealthy",
    labelEn: "Very Unhealthy",
    labelTh: "อันตราย",
    aqiMax: 300,
    pm25Max: 250.4,
    color: "#a855f7",
    text: "text-purple-700 dark:text-purple-300",
    bg: "bg-purple-600 text-white",
    soft: "bg-purple-600/10 dark:bg-purple-600/15",
    ring: "border-purple-600/30",
    adviceTh: "อันตรายต่อสุขภาพ ควรงดกิจกรรมกลางแจ้งและอยู่ในอาคาร",
  },
  {
    level: 5,
    category: "Hazardous",
    labelEn: "Hazardous",
    labelTh: "อันตรายมาก",
    aqiMax: 500,
    pm25Max: Infinity,
    color: "#7e1530",
    text: "text-rose-800 dark:text-rose-300",
    bg: "bg-rose-800 text-white",
    soft: "bg-rose-800/10 dark:bg-rose-800/20",
    ring: "border-rose-800/40",
    adviceTh: "ภาวะวิกฤต ทุกคนควรอยู่ในอาคารและใช้เครื่องฟอกอากาศ",
  },
];

/** US EPA PM2.5 (µg/m³) → AQI (0–500), piecewise linear. */
export function pm25ToAqi(pm25: number): number {
  const bp: Array<[number, number, number, number]> = [
    [0.0, 12.0, 0, 50],
    [12.1, 35.4, 51, 100],
    [35.5, 55.4, 101, 150],
    [55.5, 150.4, 151, 200],
    [150.5, 250.4, 201, 300],
    [250.5, 350.4, 301, 400],
    [350.5, 500.4, 401, 500],
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
