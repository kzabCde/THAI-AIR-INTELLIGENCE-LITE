"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";

interface Hotspot {
  lat: number;
  lon: number;
  province: string;
  count: number;
}

export function HotspotLayer({ hotspots }: { hotspots: Hotspot[] }) {
  const map = useMap();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const L = require("leaflet");
    const markers: ReturnType<typeof L.circleMarker>[] = [];

    for (const h of hotspots) {
      if (h.count === 0) continue;
      const r = Math.min(18, 4 + Math.sqrt(h.count) * 2);
      const m = L.circleMarker([h.lat, h.lon], {
        radius: r,
        color: "#dc2626",
        fillColor: "#fca5a5",
        fillOpacity: 0.6,
        weight: 2,
      });
      m.bindTooltip(`🔥 ${h.province}: ${h.count} จุดความร้อน`, { direction: "top", sticky: true });
      m.addTo(map);
      markers.push(m);
    }

    return () => markers.forEach((m) => m.remove());
  }, [map, hotspots]);

  return null;
}
