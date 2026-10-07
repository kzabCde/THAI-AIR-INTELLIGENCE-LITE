"use client";

import { Circle } from "react-leaflet";
import type { MapProvince, MapFilterMode } from "./types";

function getThermalColor(val: number, metric: MapFilterMode): string {
  if (metric === "weather") {
    // Temperature Scale (°C): 20 to 38
    if (val <= 22) return "#60a5fa"; // cool blue
    if (val <= 26) return "#34d399"; // mild teal/green
    if (val <= 30) return "#facc15"; // warm yellow
    if (val <= 34) return "#fb923c"; // soft orange
    return "#f87171"; // hot coral/red
  }

  // PM2.5 / AQI / PM10 Scale (Soft natural palette)
  if (val <= 15) return "#7bc260"; // soft green
  if (val <= 25) return "#98ce56"; // light lime
  if (val <= 37.5) return "#ebd053"; // soft mustard
  if (val <= 75) return "#e89a43"; // soft amber
  return "#dd614f"; // soft terracotta
}

export function MapThermalLayer({
  provinces,
  metric = "pm25",
  enabled = true,
}: {
  provinces: MapProvince[];
  metric?: MapFilterMode;
  enabled?: boolean;
}) {
  if (!enabled) return null;

  return (
    <>
      {/* Outermost smooth atmospheric blend halo */}
      {provinces.map((p) => {
        const val =
          metric === "weather"
            ? (p.temperature ?? 28)
            : metric === "aqi"
            ? (p.aqi ?? (p.pm25 ?? 0) * 2.2)
            : metric === "pm10"
            ? (p.pm10 ?? 25)
            : (p.pm25 ?? 15);

        const color = getThermalColor(val, metric);

        return (
          <Circle
            key={`thermal-halo-${p.id}`}
            center={[p.lat, p.lon]}
            radius={72000}
            pathOptions={{
              fillColor: color,
              fillOpacity: 0.08,
              stroke: false,
              interactive: false,
            }}
          />
        );
      })}

      {/* Mid-tier thermal aura */}
      {provinces.map((p) => {
        const val =
          metric === "weather"
            ? (p.temperature ?? 28)
            : metric === "aqi"
            ? (p.aqi ?? (p.pm25 ?? 0) * 2.2)
            : metric === "pm10"
            ? (p.pm10 ?? 25)
            : (p.pm25 ?? 15);

        const color = getThermalColor(val, metric);

        return (
          <Circle
            key={`thermal-outer-${p.id}`}
            center={[p.lat, p.lon]}
            radius={44000}
            pathOptions={{
              fillColor: color,
              fillOpacity: 0.14,
              stroke: false,
              interactive: false,
            }}
          />
        );
      })}

      {/* Inner concentrated core */}
      {provinces.map((p) => {
        const val =
          metric === "weather"
            ? (p.temperature ?? 28)
            : metric === "aqi"
            ? (p.aqi ?? (p.pm25 ?? 0) * 2.2)
            : metric === "pm10"
            ? (p.pm10 ?? 25)
            : (p.pm25 ?? 15);

        const color = getThermalColor(val, metric);

        return (
          <Circle
            key={`thermal-inner-${p.id}`}
            center={[p.lat, p.lon]}
            radius={22000}
            pathOptions={{
              fillColor: color,
              fillOpacity: 0.18,
              stroke: false,
              interactive: false,
            }}
          />
        );
      })}
    </>
  );
}
