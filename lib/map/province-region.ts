import { THAILAND_PROVINCES, type ProvinceMeta } from "@/lib/thailand-provinces";
import type { ProvinceSnapshot, RiskLevel } from "@/types/air";
import { THAI_REGION_ORDER, type ThaiRegionName } from "@/lib/map/region-colors";

export type DisplayMode = "region" | "aqi";

export type MapProvince = ProvinceSnapshot & {
  normalizedRegion: ThaiRegionName;
  mockAqi: number;
  mockPm25: number;
  mockPm10: number;
  lastUpdated: string;
};

const REGION_LABELS: Record<ProvinceMeta["region"], ThaiRegionName> = {
  North: "ภาคเหนือ",
  Northeast: "ภาคตะวันออกเฉียงเหนือ",
  Central: "ภาคกลาง",
  East: "ภาคตะวันออก",
  West: "ภาคตะวันตก",
  South: "ภาคใต้",
};

const BANGKOK_METROPOLITAN_SLUGS = new Set([
  "bangkok",
  "nakhon-pathom",
  "nonthaburi",
  "pathum-thani",
  "samut-prakan",
  "samut-sakhon",
]);

const provinceMetaBySlug = new Map(THAILAND_PROVINCES.map((province) => [province.slug, province]));

export function normalizeProvinceRegion(slug: string, sourceRegion?: string): ThaiRegionName {
  if (BANGKOK_METROPOLITAN_SLUGS.has(slug)) return "กรุงเทพมหานครและปริมณฑล";

  const metaRegion = provinceMetaBySlug.get(slug)?.region;
  if (metaRegion && metaRegion in REGION_LABELS) return REGION_LABELS[metaRegion];

  const matchedThaiRegion = THAI_REGION_ORDER.find((region) => region === sourceRegion);
  if (matchedThaiRegion) return matchedThaiRegion;

  const matchedEnglishRegion = Object.entries(REGION_LABELS).find(([englishRegion]) => englishRegion === sourceRegion)?.[1];
  return matchedEnglishRegion ?? "ภาคกลาง";
}

function riskLevelFromAqi(aqi: number): RiskLevel {
  if (aqi <= 25) return "Good";
  if (aqi <= 50) return "Moderate";
  if (aqi <= 100) return "Unhealthy Sensitive";
  if (aqi <= 150) return "Unhealthy";
  return "Hazardous";
}

function seededMockValue(seed: string, min: number, max: number) {
  const total = seed.split("").reduce((sum, char, index) => sum + char.charCodeAt(0) * (index + 7), 0);
  return min + (total % (max - min + 1));
}

export function createDemoProvinceSnapshot(meta: ProvinceMeta): ProvinceSnapshot {
  const aqi = seededMockValue(meta.slug, 28, 118);
  const pm25 = Math.max(8, Math.round((aqi * 0.42 + seededMockValue(meta.province_name_en, 0, 18)) * 10) / 10);
  return {
    ...meta,
    risk_level: riskLevelFromAqi(aqi),
    hotspot_count: seededMockValue(meta.slug, 0, 26),
    air: {
      pm25,
      pm10: Math.round((pm25 * 1.8 + seededMockValue(meta.slug, 4, 20)) * 10) / 10,
      aqi,
      source: "fallback",
      station: "Demo Data",
      fetchedAt: new Date().toISOString(),
    },
    weather: {
      temp: seededMockValue(meta.slug, 24, 36),
      humidity: seededMockValue(meta.province_name_th, 48, 86),
      wind: seededMockValue(meta.province_name_en, 2, 16),
      rain: seededMockValue(meta.slug, 0, 12),
      source: "open-meteo-weather",
    },
    predicted_pm25: pm25 + seededMockValue(meta.slug, -4, 6),
    prediction_model: "weighted-smart-score",
    insight: "Demo Data สำหรับนำเสนอภาพรวมคุณภาพอากาศรายจังหวัด",
  };
}

export function buildMapProvinces(rows: ProvinceSnapshot[] | undefined, updatedAt?: string): MapProvince[] {
  const rowsBySlug = new Map((rows ?? []).map((row) => [row.slug, row]));

  return THAILAND_PROVINCES.map((meta) => {
    const snapshot = rowsBySlug.get(meta.slug) ?? createDemoProvinceSnapshot(meta);
    return {
      ...snapshot,
      normalizedRegion: normalizeProvinceRegion(snapshot.slug, snapshot.region),
      mockAqi: snapshot.air.aqi,
      mockPm25: snapshot.air.pm25,
      mockPm10: snapshot.air.pm10,
      lastUpdated: snapshot.air.fetchedAt || updatedAt || new Date().toISOString(),
    };
  });
}

export function groupProvincesByRegion(provinces: MapProvince[]) {
  return THAI_REGION_ORDER.map((region) => {
    const items = provinces.filter((province) => province.normalizedRegion === region);
    const averageAqi = items.length ? Math.round(items.reduce((sum, province) => sum + province.mockAqi, 0) / items.length) : 0;
    const highest = [...items].sort((a, b) => b.mockAqi - a.mockAqi)[0] ?? null;

    return {
      region,
      provinces: items.sort((a, b) => a.province_name_th.localeCompare(b.province_name_th, "th")),
      provinceCount: items.length,
      averageAqi,
      highest,
    };
  });
}
