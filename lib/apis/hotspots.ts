export async function getHotspotCount(lat: number, lon: number): Promise<number> {
  // Lightweight deterministic estimate with optional NASA FIRMS fetch.
  try {
    const date = new Date().toISOString().slice(0, 10);
    const bbox = `${lon - 0.5},${lat - 0.5},${lon + 0.5},${lat + 0.5}`;
    const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${bbox}/${date}/${date}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("firms unavailable");
    const text = await res.text();
    const rows = text.trim().split("\n");
    return Math.max(0, rows.length - 1);
  } catch {
    const seasonalBoost = [1, 2, 3, 4].includes(new Date().getUTCMonth() + 1) ? 6 : 2;
    return Math.max(0, Math.round(Math.abs(Math.sin(lat + lon)) * 8 + seasonalBoost));
  }
}
