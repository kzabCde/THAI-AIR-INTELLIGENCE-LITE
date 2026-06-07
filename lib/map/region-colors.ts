export const THAI_REGION_ORDER = [
  "ภาคเหนือ",
  "ภาคตะวันออกเฉียงเหนือ",
  "ภาคกลาง",
  "ภาคตะวันออก",
  "ภาคตะวันตก",
  "ภาคใต้",
  "กรุงเทพมหานครและปริมณฑล",
] as const;

export type ThaiRegionName = (typeof THAI_REGION_ORDER)[number];

export type RegionColorToken = {
  name: ThaiRegionName;
  shortName: string;
  base: string;
  soft: string;
  border: string;
  text: string;
  gradient: string;
  shadow: string;
};

export const REGION_COLORS: Record<ThaiRegionName, RegionColorToken> = {
  ภาคเหนือ: {
    name: "ภาคเหนือ",
    shortName: "เหนือ",
    base: "#facc15",
    soft: "rgba(250, 204, 21, 0.18)",
    border: "rgba(250, 204, 21, 0.55)",
    text: "#fef08a",
    gradient: "from-yellow-300/25 to-amber-500/10",
    shadow: "shadow-amber-500/20",
  },
  ภาคตะวันออกเฉียงเหนือ: {
    name: "ภาคตะวันออกเฉียงเหนือ",
    shortName: "อีสาน",
    base: "#fb923c",
    soft: "rgba(251, 146, 60, 0.18)",
    border: "rgba(251, 146, 60, 0.55)",
    text: "#fed7aa",
    gradient: "from-orange-400/25 to-orange-600/10",
    shadow: "shadow-orange-500/20",
  },
  ภาคกลาง: {
    name: "ภาคกลาง",
    shortName: "กลาง",
    base: "#65a30d",
    soft: "rgba(101, 163, 13, 0.18)",
    border: "rgba(132, 204, 22, 0.55)",
    text: "#d9f99d",
    gradient: "from-lime-400/25 to-green-600/10",
    shadow: "shadow-lime-500/20",
  },
  ภาคตะวันออก: {
    name: "ภาคตะวันออก",
    shortName: "ตะวันออก",
    base: "#fb7185",
    soft: "rgba(251, 113, 133, 0.18)",
    border: "rgba(251, 113, 133, 0.55)",
    text: "#fecdd3",
    gradient: "from-rose-400/25 to-pink-600/10",
    shadow: "shadow-rose-500/20",
  },
  ภาคตะวันตก: {
    name: "ภาคตะวันตก",
    shortName: "ตะวันตก",
    base: "#a855f7",
    soft: "rgba(168, 85, 247, 0.18)",
    border: "rgba(168, 85, 247, 0.55)",
    text: "#e9d5ff",
    gradient: "from-purple-400/25 to-violet-700/10",
    shadow: "shadow-purple-500/20",
  },
  ภาคใต้: {
    name: "ภาคใต้",
    shortName: "ใต้",
    base: "#06b6d4",
    soft: "rgba(6, 182, 212, 0.18)",
    border: "rgba(6, 182, 212, 0.55)",
    text: "#a5f3fc",
    gradient: "from-cyan-400/25 to-blue-700/10",
    shadow: "shadow-cyan-500/20",
  },
  กรุงเทพมหานครและปริมณฑล: {
    name: "กรุงเทพมหานครและปริมณฑล",
    shortName: "กทม.ปริมณฑล",
    base: "#14b8a6",
    soft: "rgba(20, 184, 166, 0.2)",
    border: "rgba(45, 212, 191, 0.7)",
    text: "#99f6e4",
    gradient: "from-emerald-300/30 to-teal-600/15",
    shadow: "shadow-teal-500/20",
  },
};

export const AQI_CATEGORIES = [
  { label: "ดี", min: 0, max: 25, color: "#22c55e", text: "#bbf7d0" },
  { label: "ปานกลาง", min: 26, max: 50, color: "#eab308", text: "#fef08a" },
  { label: "เริ่มมีผลกระทบต่อกลุ่มเสี่ยง", min: 51, max: 100, color: "#f97316", text: "#fed7aa" },
  { label: "มีผลกระทบต่อสุขภาพ", min: 101, max: 150, color: "#ef4444", text: "#fecaca" },
  { label: "มีผลกระทบมาก", min: 151, max: 200, color: "#a855f7", text: "#e9d5ff" },
  { label: "อันตราย", min: 201, max: Number.POSITIVE_INFINITY, color: "#7f1d1d", text: "#fecaca" },
] as const;

export function getAqiCategory(aqi: number) {
  return AQI_CATEGORIES.find((category) => aqi >= category.min && aqi <= category.max) ?? AQI_CATEGORIES[AQI_CATEGORIES.length - 1];
}
