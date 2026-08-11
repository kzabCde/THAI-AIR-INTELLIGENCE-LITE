"use client";

import { useState } from "react";
import { ChevronDown, CloudRain, Droplets, MapPin, RefreshCw, Thermometer, Wind } from "lucide-react";
import { ISAN_PROVINCES } from "@/lib/isan";
import { bandForAqi, bandForPm25 } from "@/lib/aqi";
import { fmtPm25, fmtTimeTh } from "@/lib/format";
import type { ProvinceSnapshot } from "@/services/types";

export function ProvinceHeroCard({
  snapshots,
  initialProvinceId = "TH-40",
}: {
  snapshots: ProvinceSnapshot[];
  initialProvinceId?: string;
}) {
  const [selectedId, setSelectedId] = useState(initialProvinceId);

  const snapshot =
    snapshots.find((s) => s.province.id === selectedId) ?? snapshots[0];

  if (!snapshot) return null;

  const pm25 = snapshot.pm25 ?? 0;
  const aqi = snapshot.aqi ?? 0;
  const band = snapshot.aqi != null ? bandForAqi(snapshot.aqi) : bandForPm25(pm25);

  // Calculate semi-circle needle rotation angle (0 to 180 degrees for AQI 0 to 300)
  const clampedAqi = Math.min(300, Math.max(0, aqi));
  const gaugeAngle = (clampedAqi / 300) * 180;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-surface-1 via-surface-1 to-brand/5 p-6 shadow-medium transition-all">
      {/* Background Glow accent */}
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full blur-3xl opacity-20"
        style={{ background: band.color }}
      />

      {/* Header bar: Province Selector Dropdown & Status */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative inline-block">
          <div className="flex items-center gap-2 rounded-xl bg-surface-2/80 px-3.5 py-2 text-sm font-semibold shadow-sm backdrop-blur-md transition hover:bg-surface-2">
            <MapPin size={16} className="text-brand" />
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="cursor-pointer appearance-none bg-transparent pr-6 font-bold text-fg focus:outline-none"
            >
              {ISAN_PROVINCES.map((p) => (
                <option key={p.id} value={p.id} className="bg-surface-1 text-fg">
                  {p.nameTh} ({p.nameEn})
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-3 muted" />
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs muted">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 font-semibold text-emerald-600 dark:text-emerald-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            LIVE Realtime
          </span>
          <span>· อัปเดต {fmtTimeTh(snapshot.observedAt)}</span>
        </div>
      </div>

      {/* Hero Body: Gauge & Big Metric Display */}
      <div className="mt-6 grid items-center gap-6 md:grid-cols-[1.2fr_1fr]">
        {/* Left Side: Semi-Circle Speedometer Gauge */}
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border/50 bg-surface-2/40 p-6 text-center backdrop-blur-sm">
          <p className="text-xs font-semibold uppercase tracking-wider muted mb-2">คุณภาพอากาศปัจจุบัน</p>

          <div className="relative flex h-36 w-64 items-center justify-center">
            {/* SVG Semi-Circle Gauge */}
            <svg viewBox="0 0 200 110" className="h-full w-full overflow-visible">
              {/* Background Arc */}
              <path
                d="M 20 100 A 80 80 0 0 1 180 100"
                fill="none"
                stroke="currentColor"
                strokeWidth="16"
                strokeLinecap="round"
                className="text-surface-2"
              />
              {/* Colored Gradient Arc */}
              <path
                d="M 20 100 A 80 80 0 0 1 180 100"
                fill="none"
                stroke={band.color}
                strokeWidth="16"
                strokeLinecap="round"
                strokeDasharray="251.2"
                strokeDashoffset={251.2 - (clampedAqi / 300) * 251.2}
                className="transition-all duration-1000 ease-out"
              />
            </svg>

            {/* Center Value Overlay */}
            <div className="absolute top-10 flex flex-col items-center">
              <span className="text-4xl font-extrabold tracking-tight tabular-nums text-fg">
                {aqi}
              </span>
              <span className="text-xs font-bold uppercase muted">AQI</span>
              <span
                className="mt-1.5 inline-block rounded-full px-3 py-0.5 text-xs font-bold shadow-sm"
                style={{ backgroundColor: band.color, color: "#ffffff" }}
              >
                {band.labelTh}
              </span>
            </div>
          </div>

          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-xs muted">ค่า PM2.5:</span>
            <span className="text-2xl font-bold tabular-nums text-fg">{fmtPm25(pm25)}</span>
            <span className="text-xs font-semibold muted">µg/m³</span>
          </div>
        </div>

        {/* Right Side: Weather Metrics Grid & Guidance */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-border/50 bg-surface-2/30 p-4">
            <p className="text-xs font-semibold muted mb-3">สภาพอากาศสดในพื้นที่</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2.5 rounded-xl bg-surface-1/80 p-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10 text-orange-500">
                  <Thermometer size={18} />
                </div>
                <div>
                  <span className="block text-[11px] muted">อุณหภูมิ</span>
                  <span className="font-bold tabular-nums">
                    {snapshot.temperature != null ? `${snapshot.temperature.toFixed(1)}°C` : "–"}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2.5 rounded-xl bg-surface-1/80 p-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
                  <Droplets size={18} />
                </div>
                <div>
                  <span className="block text-[11px] muted">ความชื้นสัมพัทธ์</span>
                  <span className="font-bold tabular-nums">
                    {snapshot.humidity != null ? `${snapshot.humidity.toFixed(0)}%` : "–"}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2.5 rounded-xl bg-surface-1/80 p-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/10 text-teal-500">
                  <Wind size={18} />
                </div>
                <div>
                  <span className="block text-[11px] muted">ความเร็วลม</span>
                  <span className="font-bold tabular-nums">
                    {snapshot.windSpeed != null ? `${snapshot.windSpeed.toFixed(1)} m/s` : "–"}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2.5 rounded-xl bg-surface-1/80 p-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500">
                  <CloudRain size={18} />
                </div>
                <div>
                  <span className="block text-[11px] muted">ปริมาณฝน</span>
                  <span className="font-bold tabular-nums">
                    {snapshot.precipitation != null ? `${snapshot.precipitation.toFixed(1)} mm` : "0 mm"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border/40 bg-surface-1/60 p-3 text-xs leading-relaxed muted">
            💡 <strong className="text-fg">ข้อแนะนำ:</strong> {band.adviceTh}
          </div>
        </div>
      </div>
    </div>
  );
}
