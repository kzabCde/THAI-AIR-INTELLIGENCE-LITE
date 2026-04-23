export function pm25Color(pm25: number) {
  if (pm25 <= 25) return "#16a34a";
  if (pm25 <= 50) return "#eab308";
  if (pm25 <= 75) return "#f97316";
  if (pm25 <= 100) return "#ef4444";
  return "#9333ea";
}
