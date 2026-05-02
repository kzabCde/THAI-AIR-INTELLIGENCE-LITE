export function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (!n) return 0;
  const xs = x.slice(0, n);
  const ys = y.slice(0, n);
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  const numerator = xs.reduce((sum, value, i) => sum + (value - xMean) * (ys[i] - yMean), 0);
  const xVar = xs.reduce((sum, value) => sum + (value - xMean) ** 2, 0);
  const yVar = ys.reduce((sum, value) => sum + (value - yMean) ** 2, 0);
  const denominator = Math.sqrt(xVar * yVar);
  return denominator === 0 ? 0 : numerator / denominator;
}
