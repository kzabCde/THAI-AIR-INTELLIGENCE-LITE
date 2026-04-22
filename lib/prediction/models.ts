import type { HistoricalPoint } from "@/types/air";

export function movingAverageModel(history: HistoricalPoint[]): number {
  const recent = history.slice(-7);
  if (!recent.length) return 0;
  return Number((recent.reduce((sum, d) => sum + d.pm25, 0) / recent.length).toFixed(1));
}

export function linearRegressionModel(history: HistoricalPoint[]): number {
  const recent = history.slice(-14);
  if (recent.length < 2) return movingAverageModel(history);

  const xs = recent.map((_, i) => i + 1);
  const ys = recent.map((d) => d.pm25);
  const xMean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const yMean = ys.reduce((a, b) => a + b, 0) / ys.length;

  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i += 1) {
    num += (xs[i] - xMean) * (ys[i] - yMean);
    den += (xs[i] - xMean) ** 2;
  }

  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;
  const nextX = xs.length + 1;
  return Number(Math.max(1, slope * nextX + intercept).toFixed(1));
}

export function weightedSmartScoreModel(history: HistoricalPoint[], hotspotFactor: number, wind: number): number {
  const lastDay = history.at(-1)?.pm25 ?? 0;
  const avg7 = movingAverageModel(history);
  const lowWindFactor = wind <= 2 ? 20 : wind <= 5 ? 8 : 0;
  const prediction = lastDay * 0.4 + avg7 * 0.3 + hotspotFactor * 0.2 + lowWindFactor * 0.1;
  return Number(Math.max(1, prediction).toFixed(1));
}

export function chooseBestPrediction(models: { ma: number; lr: number; weighted: number }, history: HistoricalPoint[]) {
  if (history.length < 7) return { value: models.weighted || models.ma || models.lr, model: "weighted-smart-score" as const };

  const trend = (history.at(-1)?.pm25 ?? 0) - (history.at(-4)?.pm25 ?? 0);
  if (trend > 8) return { value: models.lr, model: "linear-regression" as const };
  if (trend < -5) return { value: models.ma, model: "moving-average" as const };
  return { value: models.weighted, model: "weighted-smart-score" as const };
}
