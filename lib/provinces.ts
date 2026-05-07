import provincesData from "@/data/provinces.th.json";

export type ThaiRegion = "north" | "northeast" | "central" | "east" | "west" | "south" | "bangkok-metropolitan";

export type Province = {
  id: string;
  thaiName: string;
  englishName: string;
  region: ThaiRegion;
  latitude: number;
  longitude: number;
  slug: string;
};

const PROVINCES = provincesData as Province[];

export function getAllProvinces(): Province[] {
  return PROVINCES;
}

export function getProvinceById(id: string): Province | undefined {
  return PROVINCES.find((province) => province.id.toLowerCase() === id.toLowerCase());
}

export function getProvinceBySlug(slug: string): Province | undefined {
  return PROVINCES.find((province) => province.slug === slug);
}

export function getProvincesByRegion(region: ThaiRegion): Province[] {
  return PROVINCES.filter((province) => province.region === region);
}

export function searchProvinces(query: string): Province[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return PROVINCES;

  return PROVINCES.filter((province) =>
    province.id.toLowerCase().includes(normalized)
    || province.slug.toLowerCase().includes(normalized)
    || province.englishName.toLowerCase().includes(normalized)
    || province.thaiName.toLowerCase().includes(normalized),
  );
}

export const THAILAND_PROVINCES = PROVINCES.map((province) => ({
  slug: province.slug,
  province_name_th: province.thaiName,
  province_name_en: province.englishName,
  region: province.region,
  latitude: province.latitude,
  longitude: province.longitude,
  nearby_stations: [] as string[],
}));

export const THAILAND_PROVINCE_MAP = Object.fromEntries(THAILAND_PROVINCES.map((province) => [province.slug, province]));
