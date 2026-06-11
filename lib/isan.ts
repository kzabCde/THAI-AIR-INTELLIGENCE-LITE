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
  { id: "TH-30", slug: "nakhon-ratchasima", nameEn: "Nakhon Ratchasima", nameTh: "นครราชสีมา", lat: 14.9799, lon: 102.0978, areaKm2: 20494, zone: "lower" },
  { id: "TH-31", slug: "buri-ram", nameEn: "Buri Ram", nameTh: "บุรีรัมย์", lat: 14.9951, lon: 103.1027, areaKm2: 10323, zone: "lower" },
  { id: "TH-32", slug: "surin", nameEn: "Surin", nameTh: "สุรินทร์", lat: 14.8829, lon: 103.4937, areaKm2: 8124, zone: "lower" },
  { id: "TH-33", slug: "si-sa-ket", nameEn: "Si Sa Ket", nameTh: "ศรีสะเกษ", lat: 15.1186, lon: 104.3220, areaKm2: 8840, zone: "lower" },
  { id: "TH-34", slug: "ubon-ratchathani", nameEn: "Ubon Ratchathani", nameTh: "อุบลราชธานี", lat: 15.2448, lon: 104.8473, areaKm2: 15745, zone: "lower" },
  { id: "TH-35", slug: "yasothon", nameEn: "Yasothon", nameTh: "ยโสธร", lat: 15.7930, lon: 104.1452, areaKm2: 4162, zone: "central" },
  { id: "TH-36", slug: "chaiyaphum", nameEn: "Chaiyaphum", nameTh: "ชัยภูมิ", lat: 15.8068, lon: 102.0317, areaKm2: 12778, zone: "central" },
  { id: "TH-37", slug: "amnat-charoen", nameEn: "Amnat Charoen", nameTh: "อำนาจเจริญ", lat: 15.8656, lon: 104.6257, areaKm2: 3161, zone: "central" },
  { id: "TH-38", slug: "bueng-kan", nameEn: "Bueng Kan", nameTh: "บึงกาฬ", lat: 18.3609, lon: 103.6436, areaKm2: 4305, zone: "upper" },
  { id: "TH-39", slug: "nong-bua-lam-phu", nameEn: "Nong Bua Lam Phu", nameTh: "หนองบัวลำภู", lat: 17.2022, lon: 102.4260, areaKm2: 3859, zone: "upper" },
  { id: "TH-40", slug: "khon-kaen", nameEn: "Khon Kaen", nameTh: "ขอนแก่น", lat: 16.4322, lon: 102.8236, areaKm2: 10886, zone: "central" },
  { id: "TH-41", slug: "udon-thani", nameEn: "Udon Thani", nameTh: "อุดรธานี", lat: 17.4138, lon: 102.7872, areaKm2: 11730, zone: "upper" },
  { id: "TH-42", slug: "loei", nameEn: "Loei", nameTh: "เลย", lat: 17.4860, lon: 101.7223, areaKm2: 11425, zone: "upper" },
  { id: "TH-43", slug: "nong-khai", nameEn: "Nong Khai", nameTh: "หนองคาย", lat: 17.8782, lon: 102.7415, areaKm2: 3422, zone: "upper" },
  { id: "TH-44", slug: "maha-sarakham", nameEn: "Maha Sarakham", nameTh: "มหาสารคาม", lat: 16.0132, lon: 103.1615, areaKm2: 5291, zone: "central" },
  { id: "TH-45", slug: "roi-et", nameEn: "Roi Et", nameTh: "ร้อยเอ็ด", lat: 16.0538, lon: 103.6520, areaKm2: 8300, zone: "central" },
  { id: "TH-46", slug: "kalasin", nameEn: "Kalasin", nameTh: "กาฬสินธุ์", lat: 16.4315, lon: 103.5059, areaKm2: 6947, zone: "central" },
  { id: "TH-47", slug: "sakon-nakhon", nameEn: "Sakon Nakhon", nameTh: "สกลนคร", lat: 17.1664, lon: 104.1486, areaKm2: 9606, zone: "upper" },
  { id: "TH-48", slug: "nakhon-phanom", nameEn: "Nakhon Phanom", nameTh: "นครพนม", lat: 17.3922, lon: 104.7693, areaKm2: 5512, zone: "upper" },
  { id: "TH-49", slug: "mukdahan", nameEn: "Mukdahan", nameTh: "มุกดาหาร", lat: 16.5432, lon: 104.7236, areaKm2: 4340, zone: "lower" },
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
