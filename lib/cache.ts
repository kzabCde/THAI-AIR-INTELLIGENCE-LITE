import type { HistoricalPoint, ProvinceSnapshot } from "@/types/air";

const HISTORY_KEY = "thai_air_history_v2";
const SNAPSHOT_KEY = "thai_air_snapshot_v2";
const SNAPSHOT_META_KEY = "thai_air_snapshot_meta_v1";
const MAX_DAYS = 90;
const DEFAULT_TTL_MS = 60 * 1000;

function isClient() {
  return typeof window !== "undefined";
}

type SnapshotMeta = { savedAt: number; ttlMs: number };

function readMeta(): SnapshotMeta {
  if (!isClient()) return { savedAt: 0, ttlMs: DEFAULT_TTL_MS };
  try {
    return JSON.parse(localStorage.getItem(SNAPSHOT_META_KEY) ?? "") as SnapshotMeta;
  } catch {
    return { savedAt: 0, ttlMs: DEFAULT_TTL_MS };
  }
}

export const cache = {
  saveSnapshot(data: ProvinceSnapshot[], ttlMs = DEFAULT_TTL_MS) {
    if (!isClient()) return;
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(data));
    localStorage.setItem(SNAPSHOT_META_KEY, JSON.stringify({ savedAt: Date.now(), ttlMs }));
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

  getSnapshotState() {
    const meta = readMeta();
    const age = Date.now() - meta.savedAt;
    return {
      isFresh: age <= meta.ttlMs,
      isStale: age > meta.ttlMs,
      ageMs: age,
      staleWhileRevalidate: this.getSnapshot(),
    };
  },

  getOfflineFallback(): ProvinceSnapshot[] {
    return this.getSnapshot();
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
