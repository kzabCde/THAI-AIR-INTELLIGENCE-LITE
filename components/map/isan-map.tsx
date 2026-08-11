"use client";

import { Fragment } from "react";
import { useRouter } from "next/navigation";
import { CircleMarker, MapContainer, TileLayer, Tooltip } from "react-leaflet";
import { ISAN_BOUNDS, ISAN_CENTER } from "@/lib/isan";
import { fmtPm25, fmtTimeTh } from "@/lib/format";
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
        attribution='&copy; Google Maps'
        url="https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
        subdomains={["mt0", "mt1", "mt2", "mt3"]}
        maxZoom={20}
      />
      {provinces.map((p) => {
        const r = radius(p.pm25);
        return (
          <Fragment key={p.id}>
            {/* Translucent Outer Aura for high contrast against satellite map */}
            <CircleMarker
              center={[p.lat, p.lon]}
              radius={r + 5}
              pathOptions={{
                color: p.color,
                fillColor: p.color,
                fillOpacity: 0.25,
                weight: 0,
              }}
              eventHandlers={{ click: () => router.push(`/province/${p.id}`) }}
            />
            {/* Primary Marker with Crisp White Border */}
            <CircleMarker
              center={[p.lat, p.lon]}
              radius={r}
              pathOptions={{
                color: "#ffffff",
                fillColor: p.color,
                fillOpacity: 0.9,
                weight: 2,
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
                  {p.aqi != null && (
                    <div className="text-[11px]">AQI {p.aqi}</div>
                  )}
                  {p.temperature != null && (
                    <div className="text-[11px]">
                      {p.temperature.toFixed(1)}°C
                      {p.humidity != null && ` · ${p.humidity.toFixed(0)}% RH`}
                      {p.windSpeed != null && ` · ${p.windSpeed.toFixed(1)} m/s`}
                    </div>
                  )}
                  {p.observedAt && (
                    <div className="muted text-[10px]">อัปเดต {fmtTimeTh(p.observedAt)}</div>
                  )}
                </div>
              </Tooltip>
            </CircleMarker>
          </Fragment>
        );
      })}
    </MapContainer>
  );
}
