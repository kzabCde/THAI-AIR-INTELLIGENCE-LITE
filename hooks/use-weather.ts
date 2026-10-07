"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/query/fetcher";
import { queryKeys } from "@/lib/query/keys";
import type { Tables } from "@/lib/supabase/database.types";
import type { HourlyWeatherForecast, TimePoint } from "@/services/types";

export type WeatherRow = Tables<"weather_hourly">;

export function useProvinceWeather(provinceId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.weather(provinceId),
    queryFn: ({ signal }) =>
      fetchJson<WeatherRow | null>(`/api/weather?province=${provinceId}`, signal),
    enabled: enabled && Boolean(provinceId),
    staleTime: 300_000,
    gcTime: 600_000,
    refetchOnWindowFocus: false,
  });
}

export function useWeatherHistory(provinceId: string, hours = 48, enabled = true) {
  return useQuery({
    queryKey: queryKeys.weather(provinceId, hours),
    queryFn: ({ signal }) =>
      fetchJson<{ provinceId: string; hours: number; history: TimePoint[] }>(
        `/api/weather?province=${provinceId}&hours=${hours}`,
        signal,
      ),
    enabled: enabled && Boolean(provinceId),
    staleTime: 300_000,
    gcTime: 600_000,
    refetchOnWindowFocus: false,
  });
}

/** Alias — fetches the latest weather reading for a province. */
export const useWeather = useProvinceWeather;

/**
 * Real hourly weather forecast (Open-Meteo) for the next 7 days — the only
 * source of rain probability in the UI. `initialData` lets server-rendered
 * pages hydrate without a second request.
 */
export function useHourlyWeatherForecast(
  provinceId: string,
  initialData?: HourlyWeatherForecast | null,
) {
  return useQuery({
    queryKey: ["weather-forecast", provinceId] as const,
    queryFn: ({ signal }) =>
      fetchJson<HourlyWeatherForecast>(`/api/weather/forecast?province=${provinceId}`, signal),
    enabled: Boolean(provinceId),
    initialData: initialData && initialData.provinceId === provinceId && initialData.points.length
      ? initialData
      : undefined,
    staleTime: 15 * 60_000,
    gcTime: 60 * 60_000,
    refetchOnWindowFocus: false,
  });
}
