export type SourceType = "primary" | "fallback";

export type NormalizedAirQuality = {
  source: SourceType;
  timestamp: string;
  pm25: number;
  aqi: number;
  forecast: { day: string; pm25: number; aqi: number }[];
  factors: { temperature: number; humidity: number; wind: number; hotspot: number };
  history: { time: string; pm25: number; aqi: number }[];
};

const cache = new Map<string, { data: NormalizedAirQuality; expiresAt: number }>();

const timeoutFetch = async (url: string, ms = 7000) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
};

const toAQI = (pm25: number) => Math.max(0, Math.round(pm25 * 2.1));

const createHistory = (pm25: number) =>
  Array.from({ length: 24 }).map((_, i) => ({
    time: new Date(Date.now() - (23 - i) * 3600_000).toISOString(),
    pm25: Math.max(5, pm25 + Math.sin(i / 3) * 8 + (Math.random() * 4 - 2)),
    aqi: toAQI(pm25),
  }));

const normalizeIQAir = (raw: any): Omit<NormalizedAirQuality, "source"> => {
  const current = raw?.data?.current;
  const weather = current?.weather ?? {};
  const pollution = current?.pollution ?? {};
  const pm25 = Number(pollution?.aqius ? pollution.aqius / 2.1 : 25);

  return {
    timestamp: current?.pollution?.ts ?? new Date().toISOString(),
    pm25,
    aqi: Number(pollution?.aqius ?? toAQI(pm25)),
    forecast: Array.from({ length: 3 }).map((_, idx) => ({
      day: new Date(Date.now() + idx * 86400_000).toISOString(),
      pm25: Math.max(5, pm25 + idx * 2 + (Math.random() * 4 - 2)),
      aqi: toAQI(pm25 + idx * 2),
    })),
    factors: {
      temperature: Number(weather?.tp ?? 30),
      humidity: Number(weather?.hu ?? 55),
      wind: Number(weather?.ws ?? 1.5),
      hotspot: Math.round(Math.max(0, pm25 - 25) * 1.8),
    },
    history: createHistory(pm25),
  };
};


const createLocalFallback = (): Omit<NormalizedAirQuality, "source"> => {
  const baselinePm = 22 + Math.random() * 10;

  return {
    timestamp: new Date().toISOString(),
    pm25: baselinePm,
    aqi: toAQI(baselinePm),
    forecast: Array.from({ length: 3 }).map((_, idx) => ({
      day: new Date(Date.now() + idx * 86400_000).toISOString(),
      pm25: Math.max(5, baselinePm + idx * 1.2 + (Math.random() * 3 - 1.5)),
      aqi: toAQI(baselinePm + idx * 1.2),
    })),
    factors: {
      temperature: 30,
      humidity: 60,
      wind: 2,
      hotspot: Math.round(Math.max(0, baselinePm - 20) * 1.1),
    },
    history: createHistory(baselinePm),
  };
};

const normalizeOpenWeatherFallback = (raw: any, weatherRaw: any): Omit<NormalizedAirQuality, "source"> => {
  const air = raw?.list?.[0] ?? {};
  const components = air?.components ?? {};
  const pm25 = Number(components?.pm2_5 ?? 20);
  const temp = Number((weatherRaw?.main?.temp ?? 303) - 273.15);

  return {
    timestamp: new Date((air?.dt ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
    pm25,
    aqi: Number((air?.main?.aqi ?? 2) * 50),
    forecast: Array.from({ length: 3 }).map((_, idx) => ({
      day: new Date(Date.now() + idx * 86400_000).toISOString(),
      pm25: Math.max(5, pm25 + idx * 1.5 + (Math.random() * 3 - 1.5)),
      aqi: toAQI(pm25 + idx * 1.5),
    })),
    factors: {
      temperature: temp,
      humidity: Number(weatherRaw?.main?.humidity ?? 60),
      wind: Number(weatherRaw?.wind?.speed ?? 2),
      hotspot: Math.round(Math.max(0, pm25 - 20) * 1.2),
    },
    history: createHistory(pm25),
  };
};

export const fetchAirQuality = async (lat: number, lon: number): Promise<NormalizedAirQuality> => {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.data;

  const iqairKey = process.env.NEXT_PUBLIC_IQAIR_API_KEY;
  const weatherKey = process.env.NEXT_PUBLIC_OPENWEATHER_API_KEY;

  if (iqairKey) {
    try {
      const primary = await timeoutFetch(`https://api.airvisual.com/v2/nearest_city?lat=${lat}&lon=${lon}&key=${iqairKey}`);
      if (primary.ok) {
        const body = await primary.json();
        const data = { source: "primary" as const, ...normalizeIQAir(body) };
        cache.set(key, { data, expiresAt: now + 5 * 60_000 });
        return data;
      }
    } catch {
      // fallback path
    }
  }

  if (!weatherKey) {
    const data = { source: "fallback" as const, ...createLocalFallback() };
    cache.set(key, { data, expiresAt: now + 2 * 60_000 });
    return data;
  }

  const [airResp, weatherResp] = await Promise.all([
    timeoutFetch(`https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${weatherKey}`),
    timeoutFetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${weatherKey}`),
  ]);

  if (!airResp.ok || !weatherResp.ok) throw new Error("Fallback source unavailable");

  const [airBody, weatherBody] = await Promise.all([airResp.json(), weatherResp.json()]);
  const data = { source: "fallback" as const, ...normalizeOpenWeatherFallback(airBody, weatherBody) };
  cache.set(key, { data, expiresAt: now + 5 * 60_000 });
  return data;
};
