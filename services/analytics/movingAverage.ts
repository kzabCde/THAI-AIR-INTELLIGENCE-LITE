export function rollingAverage(values: number[], windowSize = 3): number[] {
  if (windowSize <= 1) return values;
  return values.map((_, index) => {
    const start = Math.max(0, index - windowSize + 1);
    const chunk = values.slice(start, index + 1);
    return chunk.reduce((sum, value) => sum + value, 0) / chunk.length;
  });
}

export function smoothSeries(values: number[], alpha = 0.3): number[] {
  return values.reduce<number[]>((acc, value, index) => {
    if (index === 0) return [value];
    acc.push(alpha * value + (1 - alpha) * acc[index - 1]);
    return acc;
  }, []);
}
