import type { AirReading } from "@/types/air";
import { estimateAqi } from "@/lib/scoring";

type OpenAQResponse = {
  results?: Array<{
    parameter?: { name?: string };
    latest?: { value?: number };
    location?: { name?: string };
  }>;
};

type WaqiResponse = {
  status?: string;
  data?: {
    city?: { name?: string };
    iaqi?: {
      pm25?: { v?: number };
      pm10?: { v?: number };
    };
    aqi?: number;
    time?: { s?: string };
  };
};

const FALLBACK_AIR: AirReading = {
  pm25: 28,
  pm10: 42,
  aqi: estimateAqi(28),
  source: "fallback",
  station: "Fallback baseline",
  fetchedAt: new Date().toISOString(),
};

async function fetchOpenMeteoAir(lat: number, lon: number): Promise<AirReading | null> {
  try {
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm2_5,pm10,us_aqi&hourly=pm2_5,pm10&timezone=auto&forecast_hours=1`;
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      current?: { pm2_5?: number; pm10?: number; us_aqi?: number };
      hourly?: { pm2_5?: Array<number | null>; pm10?: Array<number | null> };
    };

    const firstValid = (values?: Array<number | null>) =>
      Number(values?.find((v): v is number => typeof v === "number" && Number.isFinite(v)) ?? 0);

    const pm25 = Number(json.current?.pm2_5 ?? firstValid(json.hourly?.pm2_5));
    if (!pm25 || Number.isNaN(pm25)) return null;
    const pm10 = Number(json.current?.pm10 ?? firstValid(json.hourly?.pm10) ?? pm25 * 1.35);
    const aqi = Number(json.current?.us_aqi ?? estimateAqi(pm25));

    return {
      pm25: Number(pm25.toFixed(1)),
      pm10: Number(pm10.toFixed(1)),
      aqi: Number.isFinite(aqi) ? Math.round(aqi) : estimateAqi(pm25),
      source: "open-meteo-air",
      station: "Open-Meteo Grid",
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

async function fetchOpenAQ(lat: number, lon: number): Promise<AirReading | null> {
  try {
    const url = `https://api.openaq.org/v3/sensors?coordinates=${lat},${lon}&radius=35000&parameters=pm25,pm10&limit=10`;
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const json = (await res.json()) as OpenAQResponse;
    const sensors = json.results ?? [];
    if (!sensors.length) return null;

    const pm25Sensor = sensors.find((s) => String(s.parameter?.name).toLowerCase().includes("pm25"));
    const pm10Sensor = sensors.find((s) => String(s.parameter?.name).toLowerCase().includes("pm10"));
    const pm25 = Number(pm25Sensor?.latest?.value ?? 0);
    if (!pm25 || Number.isNaN(pm25)) return null;
    const pm10 = Number(pm10Sensor?.latest?.value ?? pm25 * 1.4);

    return {
      pm25: Number(pm25.toFixed(1)),
      pm10: Number(pm10.toFixed(1)),
      aqi: estimateAqi(pm25),
      source: "openaq",
      station: pm25Sensor?.location?.name ?? "OpenAQ station",
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

async function fetchAir4Thai(lat: number, lon: number): Promise<AirReading | null> {
  try {
    const url = `https://www.air4thai.com/forweb/getAQI_JSON.php?lat=${lat}&long=${lon}`;
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const json = (await res.json()) as { stations?: Array<Record<string, unknown>>; data?: Array<Record<string, unknown>> };
    const entry = json.stations?.[0] ?? json.data?.[0];
    if (!entry) return null;

    const pm25 = Number((entry.PM25 as { value?: number } | undefined)?.value ?? entry.pm25 ?? 0);
    if (!pm25) return null;
    const pm10 = Number((entry.PM10 as { value?: number } | undefined)?.value ?? entry.pm10 ?? pm25 * 1.3);

    return {
      pm25: Number(pm25.toFixed(1)),
      pm10: Number(pm10.toFixed(1)),
      aqi: Number(entry.AQI ?? estimateAqi(pm25)),
      source: "air4thai",
      station: String(entry.nameEN ?? entry.nameTH ?? "Air4Thai station"),
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

async function fetchWaqi(lat: number, lon: number): Promise<AirReading | null> {
  try {
    const url = `https://api.waqi.info/feed/geo:${lat};${lon}/?token=demo`;
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(6_000) });
    if (!res.ok) return null;
    const json = (await res.json()) as WaqiResponse;
    if (json.status !== "ok" || !json.data) return null;

    const pm25 = Number(json.data.iaqi?.pm25?.v ?? 0);
    if (!pm25 || Number.isNaN(pm25)) return null;

    const pm10 = Number(json.data.iaqi?.pm10?.v ?? pm25 * 1.35);
    const aqi = Number(json.data.aqi ?? estimateAqi(pm25));

    return {
      pm25: Number(pm25.toFixed(1)),
      pm10: Number(pm10.toFixed(1)),
      aqi: Number.isFinite(aqi) ? Math.round(aqi) : estimateAqi(pm25),
      source: "waqi",
      station: json.data.city?.name ?? "WAQI station",
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function getBestAirReading(lat: number, lon: number): Promise<AirReading> {
  const openMeteo = await fetchOpenMeteoAir(lat, lon);
  if (openMeteo) return openMeteo;

  const waqi = await fetchWaqi(lat, lon);
  if (waqi) return waqi;

  const air4thai = await fetchAir4Thai(lat, lon);
  if (air4thai) return air4thai;

  const openaq = await fetchOpenAQ(lat, lon);
  if (openaq) return openaq;

  return { ...FALLBACK_AIR, fetchedAt: new Date().toISOString() };
}

export { FALLBACK_AIR };
