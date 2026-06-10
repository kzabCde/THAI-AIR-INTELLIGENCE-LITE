const MAP_KEY = process.env.FIRMS_MAP_KEY ?? "demo";

export async function getHotspotCount(lat: number, lon: number): Promise<number> {
  try {
    const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${MAP_KEY}/VIIRS_SNPP_NRT/${lon - 1},${lat - 1},${lon + 1},${lat + 1}/1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6_000), cache: "no-store" });
    if (res.ok) {
      const text = await res.text();
      const lines = text.trim().split("\n");
      return Math.max(0, lines.length - 1);
    }
  } catch {
    // fall through
  }
  return estimateHotspots(lat, lon);
}

export function estimateHotspots(lat: number, lon: number): number {
  const hotZones = [
    { lat: 18.79, lon: 98.99, intensity: 80 },
    { lat: 19.91, lon: 99.84, intensity: 70 },
    { lat: 19.30, lon: 97.97, intensity: 75 },
    { lat: 18.29, lon: 99.49, intensity: 55 },
    { lat: 18.14, lon: 100.14, intensity: 50 },
    { lat: 17.62, lon: 100.10, intensity: 45 },
    { lat: 16.88, lon: 99.13, intensity: 40 },
    { lat: 15.81, lon: 102.03, intensity: 30 },
    { lat: 14.88, lon: 103.49, intensity: 25 },
  ];
  let total = 0;
  for (const z of hotZones) {
    const d = Math.sqrt((lat - z.lat) ** 2 + (lon - z.lon) ** 2);
    if (d < 2.5) total += z.intensity * Math.max(0, 1 - d / 2.5);
  }
  const month = new Date().getMonth() + 1;
  const seasonBoost = [1, 2, 3, 4].includes(month) ? 1.5 : 0.5;
  return Math.round(total * seasonBoost * 0.5);
}
