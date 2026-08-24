/**
 * Single source of truth for the 20 Northeastern Thailand (Isan) provinces.
 * Mirrors the `isan_provinces` table so client components (map, labels) can
 * render instantly without a round-trip to the database.
 */

export type IsanZone = "upper" | "central" | "lower";

export type IsanProvince = {
  /** ISO 3166-2:TH code, e.g. "TH-30". Primary key in the database. */
  id: string;
  /** URL-friendly slug, e.g. "nakhon-ratchasima". */
  slug: string;
  nameEn: string;
  nameTh: string;
  lat: number;
  lon: number;
  areaKm2: number;
  zone: IsanZone;
};

export const ISAN_PROVINCES: IsanProvince[] = [
  { id: "TH-30", slug: "nakhon-ratchasima", nameEn: "Nakhon Ratchasima", nameTh: "นครราชสีมา", lat: 14.9023, lon: 102.2607, areaKm2: 20494, zone: "lower" },
  { id: "TH-31", slug: "buri-ram", nameEn: "Buri Ram", nameTh: "บุรีรัมย์", lat: 14.8174, lon: 102.9968, areaKm2: 10323, zone: "lower" },
  { id: "TH-32", slug: "surin", nameEn: "Surin", nameTh: "สุรินทร์", lat: 15.1146, lon: 103.7549, areaKm2: 8124, zone: "lower" },
  { id: "TH-33", slug: "si-sa-ket", nameEn: "Si Sa Ket", nameTh: "ศรีสะเกษ", lat: 14.7005, lon: 104.4800, areaKm2: 8840, zone: "lower" },
  { id: "TH-34", slug: "ubon-ratchathani", nameEn: "Ubon Ratchathani", nameTh: "อุบลราชธานี", lat: 14.9660, lon: 105.2271, areaKm2: 15745, zone: "lower" },
  { id: "TH-35", slug: "yasothon", nameEn: "Yasothon", nameTh: "ยโสธร", lat: 16.0775, lon: 104.4250, areaKm2: 4162, zone: "central" },
  { id: "TH-36", slug: "chaiyaphum", nameEn: "Chaiyaphum", nameTh: "ชัยภูมิ", lat: 15.9825, lon: 101.8872, areaKm2: 12778, zone: "central" },
  { id: "TH-37", slug: "amnat-charoen", nameEn: "Amnat Charoen", nameTh: "อำนาจเจริญ", lat: 15.8557, lon: 104.7546, areaKm2: 3161, zone: "central" },
  { id: "TH-38", slug: "bueng-kan", nameEn: "Bueng Kan", nameTh: "บึงกาฬ", lat: 18.2085, lon: 103.6560, areaKm2: 4305, zone: "upper" },
  { id: "TH-39", slug: "nong-bua-lam-phu", nameEn: "Nong Bua Lam Phu", nameTh: "หนองบัวลำภู", lat: 17.1408, lon: 102.3267, areaKm2: 3859, zone: "upper" },
  { id: "TH-40", slug: "khon-kaen", nameEn: "Khon Kaen", nameTh: "ขอนแก่น", lat: 16.4677, lon: 102.8101, areaKm2: 10886, zone: "central" },
  { id: "TH-41", slug: "udon-thani", nameEn: "Udon Thani", nameTh: "อุดรธานี", lat: 17.4135, lon: 102.9199, areaKm2: 11730, zone: "upper" },
  { id: "TH-42", slug: "loei", nameEn: "Loei", nameTh: "เลย", lat: 17.4135, lon: 101.6125, areaKm2: 11425, zone: "upper" },
  { id: "TH-43", slug: "nong-khai", nameEn: "Nong Khai", nameTh: "หนองคาย", lat: 17.9578, lon: 103.0518, areaKm2: 3422, zone: "upper" },
  { id: "TH-44", slug: "maha-sarakham", nameEn: "Maha Sarakham", nameTh: "มหาสารคาม", lat: 16.1514, lon: 103.2935, areaKm2: 5291, zone: "central" },
  { id: "TH-45", slug: "roi-et", nameEn: "Roi Et", nameTh: "ร้อยเอ็ด", lat: 15.9085, lon: 103.7329, areaKm2: 8300, zone: "central" },
  { id: "TH-46", slug: "kalasin", nameEn: "Kalasin", nameTh: "กาฬสินธุ์", lat: 16.5730, lon: 103.6230, areaKm2: 6947, zone: "central" },
  { id: "TH-47", slug: "sakon-nakhon", nameEn: "Sakon Nakhon", nameTh: "สกลนคร", lat: 17.2248, lon: 103.8757, areaKm2: 9606, zone: "upper" },
  { id: "TH-48", slug: "nakhon-phanom", nameEn: "Nakhon Phanom", nameTh: "นครพนม", lat: 17.4135, lon: 104.5459, areaKm2: 5512, zone: "upper" },
  { id: "TH-49", slug: "mukdahan", nameEn: "Mukdahan", nameTh: "มุกดาหาร", lat: 16.5098, lon: 104.5239, areaKm2: 4340, zone: "lower" },
];

export const ISAN_PROVINCE_COUNT = ISAN_PROVINCES.length;

const BY_ID = new Map(ISAN_PROVINCES.map((p) => [p.id, p]));
const BY_SLUG = new Map(ISAN_PROVINCES.map((p) => [p.slug, p]));

/** Resolve a province by either its id ("TH-30") or slug ("nakhon-ratchasima"). */
export function getProvince(idOrSlug: string): IsanProvince | undefined {
  return BY_ID.get(idOrSlug) ?? BY_SLUG.get(idOrSlug);
}

export function isValidProvinceId(id: string): boolean {
  return BY_ID.has(id) || BY_SLUG.has(id);
}

export const ZONE_LABELS: Record<IsanZone, { en: string; th: string }> = {
  upper: { en: "Upper Isan", th: "อีสานตอนบน" },
  central: { en: "Central Isan", th: "อีสานตอนกลาง" },
  lower: { en: "Lower Isan", th: "อีสานตอนล่าง" },
};

/** Geographic center + bounds of the Isan region (for map default view). */
export const ISAN_CENTER: [number, number] = [16.2, 103.3];
export const ISAN_BOUNDS: [[number, number], [number, number]] = [
  [13.9, 100.8],
  [18.6, 105.8],
];
