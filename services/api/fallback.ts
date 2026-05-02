import { fetchAirQuality } from "@/services/apiService";

export type NormalizedApiResponse = Awaited<ReturnType<typeof fetchAirQuality>>;

export async function fetchWithFallback(lat: number, lon: number, timeoutMs = 5000): Promise<NormalizedApiResponse> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("API timeout")), timeoutMs);
  });

  try {
    return await Promise.race([fetchAirQuality(lat, lon), timeout]);
  } catch {
    return fetchAirQuality(lat, lon);
  }
}
