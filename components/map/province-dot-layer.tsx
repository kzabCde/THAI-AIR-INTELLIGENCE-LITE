"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";
import type { ProvinceSnapshot } from "@/types/air";
import { pm25Color } from "@/lib/colors";

interface Props {
  provinces: ProvinceSnapshot[];
  onSelect?: (slug: string) => void;
  layer?: "pm25" | "aqi" | "weather";
}

export function ProvinceDotLayer({ provinces, onSelect, layer = "pm25" }: Props) {
  const map = useMap();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const L = require("leaflet");

    const circles: ReturnType<typeof L.circle>[] = [];

    for (const p of provinces) {
      const value = layer === "pm25" ? p.air.pm25 : layer === "aqi" ? p.air.aqi : p.weather.temp;
      const pm25Val = layer === "pm25" ? p.air.pm25 : layer === "aqi" ? p.air.aqi / 4 : 25;
      const color = pm25Color(pm25Val);

      const circle = L.circle([p.latitude, p.longitude], {
        radius: 25000,
        color,
        fillColor: color,
        fillOpacity: 0.45,
        weight: 1,
      });

      circle.bindTooltip(
        `<b>${p.province_name_th}</b><br/>PM2.5: ${p.air.pm25.toFixed(1)} μg/m³<br/>AQI: ${p.air.aqi}<br/>Temp: ${p.weather.temp.toFixed(1)}°C`,
        { direction: "top", sticky: true }
      );

      if (onSelect) {
        circle.on("click", () => onSelect(p.slug));
      }

      circle.addTo(map);
      circles.push(circle);
    }

    return () => {
      circles.forEach((c) => c.remove());
    };
  }, [map, provinces, layer, onSelect]);

  return null;
}
