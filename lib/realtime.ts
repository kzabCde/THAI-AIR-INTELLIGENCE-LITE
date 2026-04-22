export const REALTIME_INTERVALS = {
  pm25: 60_000,
  weather: 5 * 60_000,
  hotspot: 10 * 60_000,
};

export type RefreshType = keyof typeof REALTIME_INTERVALS;

export function shouldRefresh(lastMs: number, mode: RefreshType, now = Date.now()) {
  return now - lastMs >= REALTIME_INTERVALS[mode];
}

export function nextTickSeconds(lastMs: number, mode: RefreshType, now = Date.now()) {
  const left = REALTIME_INTERVALS[mode] - (now - lastMs);
  return Math.max(0, Math.ceil(left / 1000));
}
