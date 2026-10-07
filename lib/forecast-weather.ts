import { bandForAqi, pm25ToAqi } from "./aqi";
import type { ForecastPoint, HourlyWeatherPoint } from "@/services/types";

export interface HourlyForecastItem {
  hour: number;
  timeLabel: string;
  isCurrentHour: boolean;
  isDayStart: boolean;
  dayName: string | null;
  pm25: number;
  aqi: number;
  band: ReturnType<typeof bandForAqi>;
  temp: number;
  humid: number;
  wind: number;
  windDir: number;
  /** Model probability of rain in this hour (0–100). Null when no real forecast is available. */
  rainChance: number | null;
  /** Rain amount in this hour (mm): observed for the current hour, model forecast otherwise. */
  precipitation: number | null;
  /** Whether to draw a rain icon — see {@link isRainyHour}. */
  rainy: boolean;
  /** True when temp/humidity/wind/rain come from the real hourly forecast. */
  hasModelWeather: boolean;
}

const THAI_SHORT_DAYS = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const HOUR_MS = 3600_000;
const BANGKOK_OFFSET_MS = 7 * HOUR_MS;

/** Rain-chance labels below this are omitted to keep strips readable (weather-app convention). */
export const RAIN_CHANCE_LABEL_MIN = 10;

/**
 * Single rule for the rain icon everywhere:
 * - it is raining now (observed ≥ 0.1 mm in the latest hour), or
 * - the model gives ≥ 50 % chance, or forecasts ≥ 0.5 mm for the hour.
 */
export function isRainyHour(rainChance: number | null, precipitationMm: number | null, observed = false): boolean {
  if (observed) return (precipitationMm ?? 0) >= 0.1 || (rainChance ?? 0) >= 50;
  return (rainChance ?? 0) >= 50 || (precipitationMm ?? 0) >= 0.5;
}

export function shouldShowRainChance(rainChance: number | null): rainChance is number {
  return rainChance != null && rainChance >= RAIN_CHANCE_LABEL_MIN;
}

/** `YYYY-MM-DD` calendar date in Asia/Bangkok for a timestamp. */
export function bangkokDateKey(time: number | string | Date): string {
  const ms = typeof time === "number" ? time : new Date(time).getTime();
  return new Date(ms + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
}

function hourStart(ms: number): number {
  return Math.floor(ms / HOUR_MS) * HOUR_MS;
}

/** Index forecast points by hour start (ms) for O(1) lookup. */
export function indexWeatherByHour(points: HourlyWeatherPoint[] | null | undefined): Map<number, HourlyWeatherPoint> {
  const map = new Map<number, HourlyWeatherPoint>();
  for (const point of points ?? []) {
    const ms = Date.parse(point.t);
    if (Number.isFinite(ms)) map.set(hourStart(ms), point);
  }
  return map;
}

export function weatherAtHour(
  index: Map<number, HourlyWeatherPoint>,
  time: number | string | Date,
): HourlyWeatherPoint | undefined {
  const ms = typeof time === "number" ? time : new Date(time).getTime();
  return index.get(hourStart(ms));
}

export interface DayWeatherSummary {
  hours: number;
  tempMax: number | null;
  tempMin: number | null;
  humidityMean: number | null;
  windMean: number | null;
  windDir: number | null;
  /** Highest hourly rain probability of the day (same as Open-Meteo `precipitation_probability_max`). */
  rainChanceMax: number | null;
  /** Total forecast rain for the day (mm). */
  precipitationSum: number | null;
  rainy: boolean;
}

/**
 * Aggregate the real hourly forecast for one Bangkok calendar day.
 * `fromMs` limits the window (e.g. "today" = from the current hour onward).
 * Returns null when no forecast hours exist for that day.
 */
export function summarizeDayWeather(
  points: HourlyWeatherPoint[] | null | undefined,
  dateKey: string,
  fromMs?: number,
): DayWeatherSummary | null {
  const day = (points ?? []).filter((p) => {
    const ms = Date.parse(p.t);
    return bangkokDateKey(ms) === dateKey && (fromMs == null || ms >= hourStart(fromMs));
  });
  if (!day.length) return null;

  const values = (pick: (p: HourlyWeatherPoint) => number | null) =>
    day.map(pick).filter((v): v is number => v != null);
  const temps = values((p) => p.temperature);
  const humid = values((p) => p.humidity);
  const winds = values((p) => p.windSpeed);
  const probs = values((p) => p.precipitationProbability);
  const precip = values((p) => p.precipitation);

  let sinSum = 0;
  let cosSum = 0;
  let dirCount = 0;
  for (const p of day) {
    if (p.windDirection == null) continue;
    const rad = (p.windDirection * Math.PI) / 180;
    sinSum += Math.sin(rad);
    cosSum += Math.cos(rad);
    dirCount += 1;
  }

  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const humidityMean = mean(humid);
  const windMean = mean(winds);
  const rainChanceMax = probs.length ? Math.max(...probs) : null;
  const precipitationSum = precip.length ? +precip.reduce((a, b) => a + b, 0).toFixed(1) : null;

  return {
    hours: day.length,
    tempMax: temps.length ? Math.round(Math.max(...temps)) : null,
    tempMin: temps.length ? Math.round(Math.min(...temps)) : null,
    humidityMean: humidityMean != null ? Math.round(humidityMean) : null,
    windMean: windMean != null ? +windMean.toFixed(1) : null,
    windDir: dirCount ? Math.round(((Math.atan2(sinSum, cosSum) * 180) / Math.PI + 360) % 360) : null,
    rainChanceMax,
    precipitationSum,
    // A day is "rainy" when rain is likely (≥ 50 %) or ≥ 1 mm is forecast in total.
    rainy: (rainChanceMax ?? 0) >= 50 || (precipitationSum ?? 0) >= 1,
  };
}

const COMPASS_16 = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

/** Meteorological degrees → 16-point compass abbreviation (direction the wind comes from). */
export function degreesToCompass(deg: number): string {
  return COMPASS_16[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

/**
 * Thai Meteorological Department 24-hour rainfall categories.
 * https://www.tmd.go.th/ (ฝนเล็กน้อย 0.1–10.0, ปานกลาง 10.1–35.0, หนัก 35.1–90.0, หนักมาก > 90 มม.)
 */
export function rain24hCategory(mm: number | null): { label: string; level: 0 | 1 | 2 | 3 | 4 } | null {
  if (mm == null) return null;
  if (mm < 0.1) return { label: "ไม่มีฝน", level: 0 };
  if (mm <= 10) return { label: "ฝนเล็กน้อย", level: 1 };
  if (mm <= 35) return { label: "ฝนปานกลาง", level: 2 };
  if (mm <= 90) return { label: "ฝนหนัก", level: 3 };
  return { label: "ฝนหนักมาก", level: 4 };
}

export function getHourlyTemp(baseTemp: number, hour: number): number {
  const rad = ((hour - 14) / 24) * 2 * Math.PI;
  return Math.round(baseTemp + 3 * Math.cos(rad));
}

export function getHourlyHumidity(baseHumidity: number, hour: number): number {
  const rad = ((hour - 14) / 24) * 2 * Math.PI;
  return Math.min(100, Math.max(35, Math.round(baseHumidity - 10 * Math.cos(rad))));
}

export function getHourlyWind(baseWind: number, hour: number): number {
  const rad = ((hour - 14) / 24) * 2 * Math.PI;
  return +(Math.max(1, baseWind + 2 * Math.cos(rad))).toFixed(1);
}

/**
 * Single source of truth for 24-hour and 7-day hourly timeline forecast calculations.
 * Ensures 100% identical data across Overview, Province Detail, and Forecast pages.
 *
 * Weather per hour:
 * - current hour → latest observed values (`base*`, `precipitation`) from `weather_hourly`
 * - later hours  → real Open-Meteo hourly forecast (`weatherForecast`) when available;
 *   temperature/humidity/wind fall back to a diurnal estimate, but rain chance is
 *   never estimated — it stays `null` without model data.
 */
export function computeHourlyForecastStrip({
  currentHourTimestamp,
  hoursCount = 24,
  livePm25,
  dailyForecast = [],
  baseTemp = 28,
  baseHumidity = 70,
  baseWind = 5.0,
  baseWindDir = 180,
  precipitation = null,
  weatherForecast,
}: {
  currentHourTimestamp: number;
  hoursCount?: number;
  livePm25?: number | null;
  dailyForecast?: ForecastPoint[];
  baseTemp?: number;
  baseHumidity?: number;
  baseWind?: number;
  baseWindDir?: number;
  /** Observed rain (mm) in the latest hour — NOT the 24-hour total. */
  precipitation?: number | null;
  /** Real hourly model forecast; see services/weather-forecast.service.ts. */
  weatherForecast?: HourlyWeatherPoint[] | null;
}): HourlyForecastItem[] {
  const weatherIndex = indexWeatherByHour(weatherForecast);

  return Array.from({ length: hoursCount }, (_, i) => {
    const stepMs = currentHourTimestamp + i * HOUR_MS;
    const stepDate = new Date(stepMs);
    const hour = stepDate.getHours();
    const dayIndex = Math.min(6, Math.floor(i / 24));

    // Multi-day synoptic progression wave (fallback estimate only)
    const wave = dayIndex === 0 ? 0 : Math.sin(dayIndex * 1.1 + 0.5);
    const tempOffset = +(wave * 2.2).toFixed(1);
    const humidityOffset = +(-wave * 12).toFixed(0);
    const windMultiplier = dayIndex === 0 ? 1.0 : Math.max(0.6, 1.0 + Math.cos(dayIndex * 1.3) * 0.35);
    const windDirShift = dayIndex === 0 ? 0 : Math.sin(dayIndex * 0.8) * 35;

    // PM2.5 calculation
    const targetDaily = dailyForecast[dayIndex];
    const baseDayPm25 = targetDaily?.pm25 ?? (12 + dayIndex);
    const diurnalFactor = 0.88 + 0.24 * Math.cos(((hour - 7) / 24) * 2 * Math.PI);
    const pm25Val = i === 0 && livePm25 != null
      ? livePm25
      : Math.max(1, +(baseDayPm25 * diurnalFactor).toFixed(1));

    const aqiVal = pm25ToAqi(pm25Val);
    const band = bandForAqi(aqiVal);

    const isCurrentHour = i === 0;
    const isDayStart = hour === 0 && i > 0;
    const timeLabel = isCurrentHour ? "ตอนนี้" : `${String(hour).padStart(2, "0")}:00`;
    const dayName = isDayStart ? (THAI_SHORT_DAYS[stepDate.getDay()] ?? "-") : null;

    const model = weatherAtHour(weatherIndex, stepMs);

    // Fallback diurnal estimates (used only when the model value is missing)
    const dayBaseTemp = baseTemp + tempOffset;
    const dayBaseHumidity = Math.min(98, Math.max(35, baseHumidity + humidityOffset));
    const dayBaseWind = Math.max(1.0, baseWind * windMultiplier);

    const temp = isCurrentHour
      ? Math.round(baseTemp)
      : model?.temperature != null ? Math.round(model.temperature) : getHourlyTemp(dayBaseTemp, hour);
    const humid = isCurrentHour
      ? Math.round(baseHumidity)
      : model?.humidity != null ? Math.round(model.humidity) : getHourlyHumidity(dayBaseHumidity, hour);
    const wind = isCurrentHour
      ? +(baseWind).toFixed(1)
      : model?.windSpeed != null ? +model.windSpeed.toFixed(1) : getHourlyWind(dayBaseWind, hour);
    const windDir = isCurrentHour
      ? Math.round(baseWindDir)
      : model?.windDirection != null
      ? Math.round(model.windDirection)
      : Math.round((baseWindDir + windDirShift + hour * 8) % 360);

    // Rain: model probability only — never derived from humidity.
    const rainChance = model?.precipitationProbability != null ? Math.round(model.precipitationProbability) : null;
    const hourPrecip = isCurrentHour ? (precipitation ?? model?.precipitation ?? null) : (model?.precipitation ?? null);
    const rainy = isRainyHour(rainChance, hourPrecip, isCurrentHour && precipitation != null);

    return {
      hour,
      timeLabel,
      isCurrentHour,
      isDayStart,
      dayName,
      pm25: pm25Val,
      aqi: aqiVal,
      band,
      temp,
      humid,
      wind,
      windDir,
      rainChance,
      precipitation: hourPrecip,
      rainy,
      hasModelWeather: model != null,
    };
  });
}
