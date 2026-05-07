import { getAQICategory } from "@/lib/aqi/categories";

const COLOR_MAP: Record<string, { hex: string; bgClass: string; textClass: string }> = {
  good: { hex: "#22c55e", bgClass: "bg-emerald-100 dark:bg-emerald-900/40", textClass: "text-emerald-700 dark:text-emerald-300" },
  moderate: { hex: "#eab308", bgClass: "bg-yellow-100 dark:bg-yellow-900/40", textClass: "text-yellow-700 dark:text-yellow-300" },
  usg: { hex: "#f97316", bgClass: "bg-orange-100 dark:bg-orange-900/40", textClass: "text-orange-700 dark:text-orange-300" },
  unhealthy: { hex: "#ef4444", bgClass: "bg-rose-100 dark:bg-rose-900/40", textClass: "text-rose-700 dark:text-rose-300" },
  "very-unhealthy": { hex: "#a855f7", bgClass: "bg-purple-100 dark:bg-purple-900/40", textClass: "text-purple-700 dark:text-purple-300" },
  hazardous: { hex: "#7f1d1d", bgClass: "bg-red-200 dark:bg-red-950/60", textClass: "text-red-800 dark:text-red-200" },
};

export function getAQIColor(aqi: number): string {
  return COLOR_MAP[getAQICategory(aqi).key].hex;
}

export function getAQIBgClass(aqi: number): string {
  return COLOR_MAP[getAQICategory(aqi).key].bgClass;
}

export function getAQITextClass(aqi: number): string {
  return COLOR_MAP[getAQICategory(aqi).key].textClass;
}
