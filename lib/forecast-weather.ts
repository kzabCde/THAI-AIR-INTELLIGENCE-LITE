import { bandForAqi, pm25ToAqi } from "./aqi";
import type { ForecastPoint } from "@/services/types";

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
  rainChance: number;
}

const THAI_SHORT_DAYS = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

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
  precipitation = 0,
}: {
  currentHourTimestamp: number;
  hoursCount?: number;
  livePm25?: number | null;
  dailyForecast?: ForecastPoint[];
  baseTemp?: number;
  baseHumidity?: number;
  baseWind?: number;
  baseWindDir?: number;
  precipitation?: number | null;
}): HourlyForecastItem[] {
  return Array.from({ length: hoursCount }, (_, i) => {
    const stepDate = new Date(currentHourTimestamp + i * 3600_000);
    const hour = stepDate.getHours();
    const dayIndex = Math.min(6, Math.floor(i / 24));

    // Multi-day synoptic progression wave
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

    // Weather variables
    const dayBaseTemp = baseTemp + tempOffset;
    const dayBaseHumidity = Math.min(98, Math.max(35, baseHumidity + humidityOffset));
    const dayBaseWind = Math.max(1.0, baseWind * windMultiplier);

    const temp = isCurrentHour ? Math.round(baseTemp) : getHourlyTemp(dayBaseTemp, hour);
    const humid = isCurrentHour ? Math.round(baseHumidity) : getHourlyHumidity(dayBaseHumidity, hour);
    const wind = isCurrentHour ? +(baseWind).toFixed(1) : getHourlyWind(dayBaseWind, hour);
    const windDir = isCurrentHour
      ? Math.round(baseWindDir)
      : Math.round((baseWindDir + windDirShift + hour * 8) % 360);

    // Rain probability calculation
    const estimatedHum = Math.min(98, Math.max(40, baseHumidity + humidityOffset));
    const rainBaseChance = (precipitation ?? 0) > 0 ? 80 : estimatedHum >= 85 ? 80 : estimatedHum >= 75 ? 60 : estimatedHum >= 65 ? 30 : 10;
    const rainChance = isCurrentHour && (precipitation ?? 0) > 0
      ? 80
      : humid >= 85
      ? rainBaseChance
      : humid >= 75
      ? Math.max(10, rainBaseChance - 20)
      : 0;

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
    };
  });
}
