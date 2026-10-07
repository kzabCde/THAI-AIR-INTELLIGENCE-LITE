"use client";

import { useEffect, useState } from "react";
import { TileLayer } from "react-leaflet";

export function MapRadarLayer({ enabled = false }: { enabled?: boolean }) {
  const [radarPath, setRadarPath] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let active = true;
    fetch("https://api.rainviewer.com/public/weather-maps.json")
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        if (data?.radar?.past?.length) {
          const latest = data.radar.past[data.radar.past.length - 1];
          setRadarPath(latest.path);
        }
      })
      .catch((err) => {
        console.error("Failed to load RainViewer radar path:", err);
      });

    return () => {
      active = false;
    };
  }, [enabled]);

  if (!enabled || !radarPath) return null;

  return (
    <TileLayer
      key={radarPath}
      url={`https://tilecache.rainviewer.com${radarPath}/256/{z}/{x}/{y}/2/1_1.png`}
      opacity={0.65}
      zIndex={320}
      tileSize={256}
      maxNativeZoom={7}
      maxZoom={19}
      attribution="&copy; RainViewer Weather Radar"
    />
  );
}
