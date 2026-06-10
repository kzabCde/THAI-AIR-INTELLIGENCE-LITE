import { THAILAND_PROVINCES } from "@/lib/thailand-provinces";
import type { HistoricalPoint } from "@/types/air";

// Province-specific baseline PM2.5 based on region and season
const REGION_BASELINES: Record<string, number> = {
  North: 65,
  Northeast: 45,
  Central: 38,
  East: 32,
  West: 42,
  South: 22,
};

// Seasonal multiplier (month 1-12) - Thai burning season peaks in Feb-Apr
const SEASONAL: Record<number, number> = {
  1: 1.3, 2: 1.6, 3: 1.9, 4: 1.5, 5: 0.9, 6: 0.7,
  7: 0.6, 8: 0.6, 9: 0.8, 10: 0.9, 11: 1.0, 12: 1.1,
};

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

export function generateHistoricalData(days = 7): HistoricalPoint[] {
  const result: HistoricalPoint[] = [];
  const now = new Date();
  const month = now.getMonth() + 1;
  const seasonMult = SEASONAL[month] ?? 1.0;

  for (const province of THAILAND_PROVINCES) {
    const basePM = REGION_BASELINES[province.region] ?? 35;
    const rng = seeded(province.slug.split("").reduce((a, c) => a + c.charCodeAt(0), 0));

    // Province-specific offset (±15)
    const provinceOffset = (rng() - 0.5) * 30;
    const provincePM = basePM + provinceOffset;

    for (let d = days - 1; d >= 0; d--) {
      const date = new Date(now);
      date.setDate(date.getDate() - d);
      const dateStr = date.toISOString().slice(0, 10);

      // Day-of-week effect: weekends slightly lower traffic
      const dow = date.getDay();
      const weekdayMult = dow === 0 || dow === 6 ? 0.85 : 1.0;

      // Trend: slight increase over week for burning season
      const trendMult = 1 + (days - 1 - d) * 0.02 * (seasonMult > 1.2 ? 1 : 0);

      // Random noise ±20%
      const noise = 0.8 + rng() * 0.4;

      const pm25 = Math.max(3, provincePM * seasonMult * weekdayMult * trendMult * noise);
      const pm10 = pm25 * (1.3 + rng() * 0.3);
      const aqi = estimateAqiFromPM25(pm25);

      const temp = 28 + (rng() - 0.5) * 8;
      const humidity = 55 + (rng() - 0.5) * 30;
      const wind = 0.5 + rng() * 5.5;
      const hotspots = Math.floor(Math.max(0, (pm25 - 35) * 0.8 * rng() * 2));

      result.push({
        date: dateStr,
        province: province.slug,
        pm25: Number(pm25.toFixed(1)),
        pm10: Number(pm10.toFixed(1)),
        aqi,
        temp: Number(temp.toFixed(1)),
        humidity: Number(humidity.toFixed(0)),
        wind: Number(wind.toFixed(1)),
        hotspots,
      });
    }
  }

  return result;
}

export function getProvinceHistory(slug: string, days = 7): HistoricalPoint[] {
  return generateHistoricalData(days).filter((p) => p.province === slug);
}

function estimateAqiFromPM25(pm25: number): number {
  if (pm25 <= 12) return Math.round((pm25 / 12) * 50);
  if (pm25 <= 35.4) return Math.round(50 + ((pm25 - 12) / (35.4 - 12)) * 50);
  if (pm25 <= 55.4) return Math.round(100 + ((pm25 - 35.4) / (55.4 - 35.4)) * 50);
  if (pm25 <= 150.4) return Math.round(150 + ((pm25 - 55.4) / (150.4 - 55.4)) * 100);
  if (pm25 <= 250.4) return Math.round(200 + ((pm25 - 150.4) / (250.4 - 150.4)) * 100);
  return Math.round(300 + ((pm25 - 250.4) / (350.4 - 250.4)) * 100);
}
