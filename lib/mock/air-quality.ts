import { getAllProvinces, type Province } from "@/lib/provinces";

export type ProvinceAirQuality = {
  province: Province;
  pm25: number;
  pm10: number;
  aqi: number;
  aqiCategory: string;
  riskLevel: string;
  source: "demo";
  updatedAt: string;
  isStale: boolean;
};

import { getAQICategory } from "@/lib/aqi/calculate";

function seededValue(seed: number, min: number, max: number) {
  const x = Math.sin(seed * 999) * 10000;
  const t = x - Math.floor(x);
  return min + t * (max - min);
}

export function generateMockAirQualityData(): ProvinceAirQuality[] {
  const now = new Date();
  return getAllProvinces().map((province, index) => {
    const base = seededValue(index + 1, 20, 180);
    const pm25 = Number(base.toFixed(1));
    const pm10 = Number((pm25 * seededValue(index + 3, 1.2, 1.9)).toFixed(1));
    const aqi = Math.round(Math.min(300, pm25 * 2.3 + seededValue(index + 8, 0, 40)));

    return {
      province,
      pm25,
      pm10,
      aqi,
      aqiCategory: getAQICategory(aqi).label,
      riskLevel: getAQICategory(aqi).thaiLabel,
      source: "demo",
      updatedAt: new Date(now.getTime() - (index % 6) * 60000).toISOString(),
      isStale: index % 9 === 0,
    };
  });
}
