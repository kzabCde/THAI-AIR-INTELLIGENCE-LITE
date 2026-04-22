import type { HistoricalPoint, ProvinceSnapshot } from "@/types/air";

const HISTORY_KEY = "thai_air_history_v2";
const SNAPSHOT_KEY = "thai_air_snapshot_v2";
const MAX_DAYS = 90;

function isClient() {
  return typeof window !== "undefined";
}

export const cache = {
  saveSnapshot(data: ProvinceSnapshot[]) {
    if (!isClient()) return;
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(data));
  },

  getSnapshot(): ProvinceSnapshot[] {
    if (!isClient()) return [];
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as ProvinceSnapshot[];
    } catch {
      return [];
    }
  },

  saveHistoricalPoint(point: HistoricalPoint) {
    if (!isClient()) return;
    const items = this.getHistoryByProvince(point.province);
    const deduped = items.filter((x) => x.date !== point.date);
    deduped.push(point);
    const rolling = deduped.slice(-MAX_DAYS);

    const all = this.getAllHistory().filter((x) => x.province !== point.province);
    localStorage.setItem(HISTORY_KEY, JSON.stringify([...all, ...rolling]));
  },

  getAllHistory(): HistoricalPoint[] {
    if (!isClient()) return [];
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as HistoricalPoint[];
    } catch {
      return [];
    }
  },

  getHistoryByProvince(province: string): HistoricalPoint[] {
    return this.getAllHistory()
      .filter((x) => x.province === province)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  },
};
