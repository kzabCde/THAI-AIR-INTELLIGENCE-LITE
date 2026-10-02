"use client";

import { useState, useMemo } from "react";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  MapPin,
  Calendar,
  BarChart3,
  ArrowUpRight,
  Globe,
} from "lucide-react";
import { bandForPm25, pm25ToAqi, aqiToGradientColor } from "@/lib/aqi";
import { ZONE_LABELS, type IsanZone } from "@/lib/isan";
import type { RegionalForecastSummary, RegionalForecastEntry } from "@/services/regional-forecast.service";

/* ── Constants ─────────────────────────────────────────────── */

const THAI_SHORT_DAYS = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const THAI_SHORT_MONTHS = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

type SortKey = "name" | "current" | "d1" | "d3" | "trend";
type ZoneFilter = "all" | IsanZone;

/* ── Helpers ───────────────────────────────────────────────── */

function fmtDateShort(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${THAI_SHORT_DAYS[d.getDay()]} ${d.getDate()} ${THAI_SHORT_MONTHS[d.getMonth()]}`;
}

function TrendIcon({ trend }: { trend: "up" | "down" | "flat" }) {
  if (trend === "up") return <TrendingUp size={14} className="text-red-500" />;
  if (trend === "down") return <TrendingDown size={14} className="text-emerald-500" />;
  return <Minus size={14} className="text-slate-400" />;
}

function AqiPill({ pm25 }: { pm25: number }) {
  const band = bandForPm25(pm25);
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
      style={{ backgroundColor: band.color }}
    >
      {pm25.toFixed(0)}
    </span>
  );
}

function AqiBadge({ pm25, showLabel }: { pm25: number; showLabel?: boolean }) {
  const band = bandForPm25(pm25);
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="h-2.5 w-2.5 rounded-full shrink-0"
        style={{ backgroundColor: band.color }}
      />
      {showLabel && (
        <span className="text-[10px] font-medium" style={{ color: band.color }}>
          {band.labelTh}
        </span>
      )}
    </div>
  );
}

/* ── Main Component ────────────────────────────────────────── */

export function RegionalForecastDashboard({
  summary,
}: {
  summary: RegionalForecastSummary;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("d1");
  const [sortAsc, setSortAsc] = useState(false);
  const [zoneFilter, setZoneFilter] = useState<ZoneFilter>("all");

  const filteredAndSorted = useMemo(() => {
    let list = summary.entries;
    if (zoneFilter !== "all") {
      list = list.filter((e) => e.zone === zoneFilter);
    }
    return [...list].sort((a, b) => {
      let diff = 0;
      switch (sortKey) {
        case "name":
          diff = a.nameTh.localeCompare(b.nameTh, "th");
          break;
        case "current":
          diff = (a.currentPm25 ?? 0) - (b.currentPm25 ?? 0);
          break;
        case "d1":
          diff = (a.daily[0]?.pm25 ?? 0) - (b.daily[0]?.pm25 ?? 0);
          break;
        case "d3":
          diff = (a.daily[2]?.pm25 ?? 0) - (b.daily[2]?.pm25 ?? 0);
          break;
        case "trend": {
          const trendScore = { up: 2, flat: 1, down: 0 };
          diff = trendScore[a.trend] - trendScore[b.trend];
          break;
        }
      }
      return sortAsc ? diff : -diff;
    });
  }, [summary.entries, sortKey, sortAsc, zoneFilter]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  // Dates from the first entry's daily array
  const dates = summary.entries[0]?.daily.map((d) => d.date) ?? [];

  return (
    <div className="space-y-4">
      {/* ── KPI Summary Cards ────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          icon={<Globe size={16} />}
          label="เฉลี่ยทั้งภาค (พรุ่งนี้)"
          value={`${summary.avgPm25D1} µg/m³`}
          sub={`AQI ${summary.avgAqiD1}`}
          color={aqiToGradientColor(summary.avgAqiD1)}
        />
        <KpiCard
          icon={<ArrowUpRight size={16} />}
          label="จังหวัดสูงสุด (พรุ่งนี้)"
          value={summary.worstD1?.nameTh ?? "-"}
          sub={`${summary.worstD1?.daily[0]?.pm25.toFixed(1) ?? "-"} µg/m³`}
          color={summary.worstD1 ? aqiToGradientColor(pm25ToAqi(summary.worstD1.daily[0]?.pm25 ?? 0)) : "#64748b"}
        />
        <KpiCard
          icon={<MapPin size={16} />}
          label="จังหวัดต่ำสุด (พรุ่งนี้)"
          value={summary.bestD1?.nameTh ?? "-"}
          sub={`${summary.bestD1?.daily[0]?.pm25.toFixed(1) ?? "-"} µg/m³`}
          color={summary.bestD1 ? aqiToGradientColor(pm25ToAqi(summary.bestD1.daily[0]?.pm25 ?? 0)) : "#64748b"}
        />
        <KpiCard
          icon={<BarChart3 size={16} />}
          label="จำนวนจังหวัด"
          value={`${summary.entries.length} จังหวัด`}
          sub="ภาคตะวันออกเฉียงเหนือ"
          color="rgb(var(--brand))"
        />
      </div>

      {/* ── Filter + Sort Controls ───────────────────────────── */}
      <div className="card card-pad">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-sm font-bold flex items-center gap-2">
            <Calendar size={15} className="text-teal-600 dark:text-teal-400" />
            พยากรณ์ 7 วัน — ทุกจังหวัด
          </h2>

          {/* Zone filter pills */}
          <div className="flex gap-1.5">
            {(["all", "upper", "central", "lower"] as ZoneFilter[]).map((zone) => (
              <button
                key={zone}
                onClick={() => setZoneFilter(zone)}
                className={`rounded-full px-3 py-1 text-[11px] font-medium transition ${
                  zoneFilter === zone
                    ? "bg-teal-600 text-white dark:bg-teal-500"
                    : "bg-[rgb(var(--surface-2))] text-[rgb(var(--muted))] hover:bg-teal-50 dark:hover:bg-teal-950/30"
                }`}
              >
                {zone === "all" ? "ทั้งหมด" : ZONE_LABELS[zone].th}
              </button>
            ))}
          </div>
        </div>

        {/* ── Heatmap Table ─────────────────────────────────── */}
        <div className="overflow-x-auto -mx-4 sm:-mx-5">
          <table className="w-full min-w-[700px] text-xs">
            <thead>
              <tr className="border-b border-[rgb(var(--border))]">
                <SortableHeader label="จังหวัด" sortKey="name" currentKey={sortKey} asc={sortAsc} onClick={handleSort} className="pl-4 sm:pl-5 w-32" />
                <SortableHeader label="ปัจจุบัน" sortKey="current" currentKey={sortKey} asc={sortAsc} onClick={handleSort} className="w-20 text-center" />
                {dates.map((date, i) => (
                  <th key={date} className="py-2 px-1 text-center font-medium text-[rgb(var(--muted))]">
                    <button
                      onClick={() => handleSort(i === 0 ? "d1" : i === 2 ? "d3" : "d1")}
                      className="hover:text-teal-600 transition"
                    >
                      <div className="text-[10px]">{fmtDateShort(date)}</div>
                      <div className="text-[9px] opacity-60">D+{i + 1}</div>
                    </button>
                  </th>
                ))}
                <SortableHeader label="แนวโน้ม" sortKey="trend" currentKey={sortKey} asc={sortAsc} onClick={handleSort} className="w-16 text-center pr-4 sm:pr-5" />
              </tr>
            </thead>
            <tbody>
              {filteredAndSorted.map((entry) => (
                <ForecastRow key={entry.provinceId} entry={entry} />
              ))}
            </tbody>
          </table>
        </div>

        {filteredAndSorted.length === 0 && (
          <p className="py-8 text-center text-sm text-[rgb(var(--muted))]">ไม่พบข้อมูล</p>
        )}
      </div>

      {/* ── Color Legend ──────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-center gap-3 text-[10px] text-[rgb(var(--muted))]">
        {[
          { label: "ดีมาก", color: "#16a34a" },
          { label: "ดี", color: "#84cc16" },
          { label: "ปานกลาง", color: "#eab308" },
          { label: "เริ่มมีผลกระทบ", color: "#f97316" },
          { label: "มีผลกระทบ", color: "#ef4444" },
        ].map((item) => (
          <span key={item.label} className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
            {item.label}
          </span>
        ))}
        <span className="ml-2">| ค่า = PM2.5 (µg/m³)</span>
      </div>
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────── */

function KpiCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <div className="card card-pad flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-[rgb(var(--muted))]">
        <span style={{ color }}>{icon}</span>
        <span className="text-[10px] font-medium uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-base font-bold leading-tight" style={{ color }}>{value}</p>
      <p className="text-[10px] text-[rgb(var(--muted))]">{sub}</p>
    </div>
  );
}

function SortableHeader({
  label,
  sortKey,
  currentKey,
  asc,
  onClick,
  className = "",
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  asc: boolean;
  onClick: (key: SortKey) => void;
  className?: string;
}) {
  const isActive = currentKey === sortKey;
  return (
    <th className={`py-2 px-1 text-left font-medium ${className}`}>
      <button
        onClick={() => onClick(sortKey)}
        className={`flex items-center gap-0.5 transition ${
          isActive ? "text-teal-600 dark:text-teal-400" : "text-[rgb(var(--muted))] hover:text-teal-600"
        }`}
      >
        {label}
        {isActive && (
          <span className="text-[9px]">{asc ? "↑" : "↓"}</span>
        )}
      </button>
    </th>
  );
}

function ForecastRow({ entry }: { entry: RegionalForecastEntry }) {
  const currentBand = entry.currentPm25 != null ? bandForPm25(entry.currentPm25) : null;

  return (
    <tr className="border-b border-[rgb(var(--border))]/50 hover:bg-[rgb(var(--surface-2))]/50 transition">
      {/* Province name */}
      <td className="py-2.5 px-1 pl-4 sm:pl-5">
        <a
          href={`/forecast?province=${entry.provinceId}`}
          className="flex items-center gap-1.5 group"
        >
          <MapPin size={11} className="text-teal-600 dark:text-teal-400 shrink-0" />
          <span className="font-bold text-[rgb(var(--fg))] group-hover:text-teal-600 transition truncate">
            {entry.nameTh}
          </span>
        </a>
      </td>

      {/* Current PM2.5 */}
      <td className="py-2.5 px-1 text-center">
        {entry.currentPm25 != null ? (
          <span
            className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
            style={{ backgroundColor: currentBand?.color ?? "#64748b" }}
          >
            {entry.currentPm25.toFixed(0)}
          </span>
        ) : (
          <span className="text-[rgb(var(--muted))]">-</span>
        )}
      </td>

      {/* D+1 through D+7 heatmap cells */}
      {entry.daily.map((d) => (
        <td key={d.date} className="py-2.5 px-0.5 text-center">
          <div
            className="mx-auto flex h-7 w-full max-w-[52px] items-center justify-center rounded-lg text-[11px] font-bold text-white transition-all hover:scale-105"
            style={{ backgroundColor: d.color }}
            title={`${d.date}: ${d.pm25} µg/m³ (AQI ${d.aqi}) — ${d.labelTh}`}
          >
            {d.pm25.toFixed(0)}
          </div>
        </td>
      ))}

      {/* Trend */}
      <td className="py-2.5 px-1 pr-4 sm:pr-5 text-center">
        <div className="flex items-center justify-center">
          <TrendIcon trend={entry.trend} />
        </div>
      </td>
    </tr>
  );
}
