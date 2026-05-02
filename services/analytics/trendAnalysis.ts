import { rollingAverage } from "@/services/analytics/movingAverage";

export function analyzeTrend(values: number[]) {
  const hourly = values.slice(-24);
  const dailyAverage = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  const moving = rollingAverage(values, 6);
  const direction = moving[moving.length - 1] >= moving[Math.max(0, moving.length - 2)] ? "up" : "down";

  return { hourly, dailyAverage, moving, direction };
}
