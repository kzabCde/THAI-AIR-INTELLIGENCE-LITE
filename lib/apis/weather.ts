import type { WeatherReading } from "@/types/air";

const FALLBACK_WEATHER: WeatherReading = { temp: 30, humidity: 65, wind: 5, rain: 0, source: "open-meteo-weather" };

export async function getWeather(lat: number, lon: number): Promise<WeatherReading> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation&timezone=auto`;
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
    if (!res.ok) throw new Error("weather unavailable");
    const json = (await res.json()) as {
      hourly?: {
        temperature_2m?: number[];
        relative_humidity_2m?: number[];
        wind_speed_10m?: number[];
        precipitation?: number[];
      };
    };
    const i = (json.hourly?.temperature_2m?.length ?? 1) - 1;

    return {
      temp: Number((json.hourly?.temperature_2m?.[i] ?? 30).toFixed(1)),
      humidity: Number((json.hourly?.relative_humidity_2m?.[i] ?? 60).toFixed(1)),
      wind: Number((json.hourly?.wind_speed_10m?.[i] ?? 4).toFixed(1)),
      rain: Number((json.hourly?.precipitation?.[i] ?? 0).toFixed(1)),
      source: "open-meteo-weather",
    };
  } catch {
    return FALLBACK_WEATHER;
  }
}

export { FALLBACK_WEATHER };
