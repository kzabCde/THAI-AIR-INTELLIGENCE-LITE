"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { generateMockAirQualityData } from "@/lib/mock/air-quality";
import { calculateRisk } from "@/lib/risk/calculate-risk";
import { getAQICategory, getAQIColor } from "@/lib/aqi/calculate";
import { type ThaiRegion } from "@/lib/provinces";

const regions: (ThaiRegion | "all")[] = ["all", "north", "northeast", "central", "east", "west", "south", "bangkok-metropolitan"];
const aqiFilters = ["all", "Good", "Moderate", "Unhealthy for Sensitive Groups", "Unhealthy", "Very Unhealthy", "Hazardous"] as const;
const riskFilters = ["all", "ต่ำ", "ปานกลาง", "เริ่มกระทบกลุ่มเสี่ยง", "สูง", "รุนแรง"] as const;

export function AirQualityMapClient() {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const leafletMap = useRef<any>(null);
  const markerLayer = useRef<any>(null);
  const [region, setRegion] = useState<(typeof regions)[number]>("all");
  const [aqiFilter, setAqiFilter] = useState<(typeof aqiFilters)[number]>("all");
  const [riskFilter, setRiskFilter] = useState<(typeof riskFilters)[number]>("all");

  const rows = useMemo(() => generateMockAirQualityData().map((row) => ({
    ...row,
    risk: calculateRisk({ pm25: row.pm25, pm10: row.pm10, aqi: row.aqi, windSpeed: 7, humidity: 70, temperature: 34, isStale: row.isStale }),
  })), []);

  const filtered = useMemo(() => rows.filter((row) => (region === "all" || row.province.region === region)
      && (aqiFilter === "all" || row.aqiCategory === aqiFilter)
      && (riskFilter === "all" || row.risk.thaiLabel === riskFilter)), [rows, region, aqiFilter, riskFilter]);

  const summary = useMemo(() => {
    const worst = [...filtered].sort((a, b) => b.aqi - a.aqi)[0];
    const best = [...filtered].sort((a, b) => a.aqi - b.aqi)[0];
    const avg = filtered.length ? Math.round(filtered.reduce((s, r) => s + r.aqi, 0) / filtered.length) : 0;
    const highRisk = filtered.filter((r) => r.risk.riskScore >= 61).length;
    return { worst, best, avg, highRisk };
  }, [filtered]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !mapRef.current || leafletMap.current) return;

      const thailandBounds = L.latLngBounds([[5.4, 97.2], [20.6, 105.8]]);
      leafletMap.current = L.map(mapRef.current, {
        maxBounds: thailandBounds,
        maxBoundsViscosity: 1.0,
        minZoom: 5.5,
        maxZoom: 10,
      });
      leafletMap.current.fitBounds(thailandBounds);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap" }).addTo(leafletMap.current);
      markerLayer.current = L.layerGroup().addTo(leafletMap.current);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    (async () => {
      if (!leafletMap.current || !markerLayer.current) return;
      const L = await import("leaflet");
      markerLayer.current.clearLayers();
      filtered.forEach((row) => {
        const circle = L.circleMarker([row.province.latitude, row.province.longitude], {
          radius: 8,
          color: getAQIColor(row.aqi),
          fillColor: getAQIColor(row.aqi),
          fillOpacity: 0.8,
          weight: 2,
        });
        circle.bindTooltip(`${row.province.thaiName}<br/>AQI: ${row.aqi}<br/>PM2.5: ${row.pm25}<br/>PM10: ${row.pm10}<br/>Risk: ${row.risk.thaiLabel}<br/>source: ${row.source}`);
        circle.on("click", () => { window.location.href = `/province/${row.province.id}`; });
        circle.addTo(markerLayer.current);
      });
    })();
  }, [filtered]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs"><span className="rounded-full bg-violet-100 px-2 py-1 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">Demo Data</span><span className="text-slate-500">Mock map only — no live provider</span></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>พื้นที่เสี่ยงสูงสุด: {summary.worst?.province.thaiName ?? "-"}</Card>
        <Card>พื้นที่อากาศดีที่สุด: {summary.best?.province.thaiName ?? "-"}</Card>
        <Card>AQI เฉลี่ย: {summary.avg}</Card>
        <Card>จังหวัดเสี่ยงสูง: {summary.highRisk}</Card>
      </div>
      <Card>
        <div className="grid gap-3 md:grid-cols-3">
          <select value={aqiFilter} onChange={(e) => setAqiFilter(e.target.value as (typeof aqiFilters)[number])} className="rounded-xl border bg-white/80 px-3 py-2 text-sm dark:bg-slate-900">{aqiFilters.map((v)=><option key={v}>{v}</option>)}</select>
          <select value={region} onChange={(e) => setRegion(e.target.value as (typeof regions)[number])} className="rounded-xl border bg-white/80 px-3 py-2 text-sm dark:bg-slate-900">{regions.map((v)=><option key={v}>{v}</option>)}</select>
          <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value as (typeof riskFilters)[number])} className="rounded-xl border bg-white/80 px-3 py-2 text-sm dark:bg-slate-900">{riskFilters.map((v)=><option key={v}>{v}</option>)}</select>
        </div>
      </Card>

      <Card className="p-2">
        <div ref={mapRef} className="h-[60vh] w-full rounded-2xl" />
      </Card>

      <Card>
        <h3 className="font-semibold">Legend</h3>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {aqiFilters.filter((f) => f !== "all").map((label) => {
            const sample = label === "Hazardous" ? 320 : label === "Very Unhealthy" ? 230 : label === "Unhealthy" ? 160 : label === "Unhealthy for Sensitive Groups" ? 120 : label === "Moderate" ? 80 : 30;
            const color = getAQIColor(sample);
            return <div key={label} className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />{label}</div>;
          })}
        </div>
        <p className="mt-3 text-xs text-slate-500">คลิก marker เพื่อเปิดหน้ารายละเอียดจังหวัด</p>
        <Link href="/province" className="mt-2 inline-block text-sm underline">ไปยังสารบบจังหวัด</Link>
      </Card>
    </div>
  );
}
