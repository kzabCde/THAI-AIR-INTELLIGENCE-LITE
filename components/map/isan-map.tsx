"use client";

import "@/lib/leaflet-icon-fix";
import { useRouter } from "next/navigation";
import { CircleMarker, MapContainer, TileLayer, Tooltip } from "react-leaflet";
import { ISAN_BOUNDS, ISAN_CENTER } from "@/lib/isan";
import { fmtPm25 } from "@/lib/format";
import type { MapProvince } from "./types";

/** Marker radius scales gently with PM2.5 so hotspots stand out. */
function radius(pm25: number | null): number {
  if (pm25 == null) return 9;
  return Math.max(9, Math.min(26, 9 + pm25 / 6));
}

export default function IsanMap({ provinces }: { provinces: MapProvince[] }) {
  const router = useRouter();
  return (
    <MapContainer
      center={ISAN_CENTER}
      zoom={7}
      minZoom={6}
      maxBounds={ISAN_BOUNDS}
      maxBoundsViscosity={0.8}
      scrollWheelZoom={false}
      className="h-full w-full rounded-2xl"
      preferCanvas
    >
      <TileLayer
        attribution='&copy; OpenStreetMap'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      />
      {provinces.map((p) => (
        <CircleMarker
          key={p.id}
          center={[p.lat, p.lon]}
          radius={radius(p.pm25)}
          pathOptions={{
            color: p.color,
            fillColor: p.color,
            fillOpacity: 0.7,
            weight: 1.5,
          }}
          eventHandlers={{ click: () => router.push(`/province/${p.id}`) }}
        >
          <Tooltip className="province-tip" direction="top" offset={[0, -4]}>
            <div className="space-y-0.5">
              <div className="font-semibold">{p.nameTh}</div>
              <div className="muted text-[11px]">{p.nameEn}</div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                <span className="font-bold">{fmtPm25(p.pm25)}</span>
                <span className="text-[11px]">µg/m³ · {p.labelTh}</span>
              </div>
              {p.aqi != null && <div className="text-[11px]">AQI {p.aqi}</div>}
            </div>
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
