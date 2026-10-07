"use client";

import { useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  ArrowDownUp,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleGauge,
  Database,
  FlaskConical,
  Globe2,
  MapPin,
  Minus,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";
import { bandForPm25 } from "@/lib/aqi";
import { ZONE_LABELS, type IsanZone } from "@/lib/isan";
import type {
  RegionalForecastDay,
  RegionalForecastEntry,
  RegionalForecastSummary,
} from "@/services/regional-forecast.service";

type SortKey = "name" | "current" | "d1" | "d3" | "trend";
type ZoneFilter = "all" | IsanZone;

const ZONES: ZoneFilter[] = ["all", "upper", "central", "lower"];
const THAI_ZONE_SHORT: Record<ZoneFilter, string> = {
  all: "ทุกพื้นที่",
  upper: "อีสานตอนบน",
  central: "อีสานตอนกลาง",
  lower: "อีสานตอนล่าง",
};

function formatDate(date: string, withYear = false) {
  if (!date) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" as const } : {}),
    timeZone: "Asia/Bangkok",
  }).format(new Date(`${date}T00:00:00+07:00`));
}

function formatDateTime(value: string | null) {
  if (!value) return "ไม่ระบุ";
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}

function modelLabel(model: string) {
  if (model === "lightgbm-pm25-residual-v2") return "LightGBM รายจังหวัด";
  if (model === "recent-mean-v1") return "ค่าเฉลี่ยข้อมูลล่าสุด";
  return model === "unknown" ? "ไม่ระบุโมเดล" : model;
}

function TrendIcon({ trend }: { trend: RegionalForecastEntry["trend"] }) {
  if (trend === "up") return <TrendingUp className="h-4 w-4" />;
  if (trend === "down") return <TrendingDown className="h-4 w-4" />;
  return <Minus className="h-4 w-4" />;
}

function trendMeta(entry: RegionalForecastEntry) {
  const first = entry.daily.find((day) => day.horizonDays === 1)?.pm25;
  const last = entry.daily.find((day) => day.horizonDays === 7)?.pm25;
  const delta = first == null || last == null ? null : +(last - first).toFixed(1);
  if (entry.trend === "up") return { label: "เพิ่ม", className: "text-rose-600 dark:text-rose-400", delta };
  if (entry.trend === "down") return { label: "ลด", className: "text-emerald-600 dark:text-emerald-400", delta };
  return { label: "ทรงตัว", className: "text-slate-500 dark:text-slate-400", delta };
}

function sortValue(entry: RegionalForecastEntry, key: SortKey) {
  if (key === "name") return entry.nameTh;
  if (key === "current") return entry.currentPm25;
  if (key === "d1") return entry.daily.find((day) => day.horizonDays === 1)?.pm25 ?? null;
  if (key === "d3") return entry.daily.find((day) => day.horizonDays === 3)?.pm25 ?? null;
  return { down: 0, flat: 1, up: 2 }[entry.trend];
}

export function RegionalForecastDashboard({ summary }: { summary: RegionalForecastSummary }) {
  const [sortKey, setSortKey] = useState<SortKey>("d1");
  const [sortAsc, setSortAsc] = useState(false);
  const [zoneFilter, setZoneFilter] = useState<ZoneFilter>("all");

  const visibleEntries = useMemo(() => {
    const entries = zoneFilter === "all"
      ? summary.entries
      : summary.entries.filter((entry) => entry.zone === zoneFilter);

    return [...entries].sort((a, b) => {
      const aValue = sortValue(a, sortKey);
      const bValue = sortValue(b, sortKey);
      if (aValue == null) return 1;
      if (bValue == null) return -1;
      const result = typeof aValue === "string"
        ? aValue.localeCompare(String(bValue), "th")
        : aValue - Number(bValue);
      return sortAsc ? result : -result;
    });
  }, [sortAsc, sortKey, summary.entries, zoneFilter]);

  const d1Date = summary.dailyAverages.find((day) => day.horizonDays === 1)?.date ?? "";
  const worstD1Value = summary.worstD1?.daily.find((day) => day.horizonDays === 1)?.pm25;
  const highRiskCount = summary.entries.filter((entry) => {
    const value = entry.daily.find((day) => day.horizonDays === 1)?.pm25;
    return value != null && value > 37.5;
  }).length;
  const risingCount = summary.entries.filter((entry) => entry.trend === "up").length;
  const coveragePercent = summary.coverage.expectedCells
    ? Math.round((summary.coverage.forecastCells / summary.coverage.expectedCells) * 100)
    : 0;
  const topRisk = [...summary.entries]
    .filter((entry) => entry.daily.some((day) => day.horizonDays === 1))
    .sort((a, b) => (
      b.daily.find((day) => day.horizonDays === 1)?.pm25 ?? 0
    ) - (
      a.daily.find((day) => day.horizonDays === 1)?.pm25 ?? 0
    ))
    .slice(0, 5);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((value) => !value);
    else {
      setSortKey(key);
      setSortAsc(key === "name");
    }
  };

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-2xl border border-teal-200/70 bg-gradient-to-br from-teal-950 via-teal-900 to-slate-900 p-4 text-white shadow-lg shadow-teal-950/10 sm:rounded-3xl sm:p-7 sm:shadow-xl">
        <div className="absolute -right-16 -top-20 h-40 w-40 rounded-full bg-emerald-400/15 blur-3xl sm:h-56 sm:w-56" />
        <div className="absolute -bottom-24 left-1/3 h-52 w-52 rounded-full bg-cyan-300/10 blur-3xl" />
        <div className="relative grid gap-3 sm:gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-teal-50 backdrop-blur sm:mb-3 sm:gap-2 sm:px-3 sm:py-1 sm:text-xs">
              <Globe2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              ภาพรวม 20 จังหวัดภาคอีสาน
            </div>
            <h1 className="text-lg font-extrabold leading-snug tracking-tight sm:text-3xl sm:font-black">พยากรณ์ PM2.5 ระดับภูมิภาค</h1>
            <p className="mt-2 hidden max-w-2xl text-sm leading-6 text-teal-50/80 sm:block">
              เปรียบเทียบค่าพยากรณ์รายจังหวัด เห็นพื้นที่ที่ควรจับตา และตรวจสถานะข้อมูลก่อนตัดสินใจ
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px] sm:mt-4 sm:gap-2 sm:text-xs">
              <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 sm:gap-1.5 sm:px-3 sm:py-1.5">
                <CalendarDays className="h-3 w-3 text-teal-300 sm:h-3.5 sm:w-3.5" />
                D+1 เป้าหมาย {formatDate(d1Date, true)}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 sm:gap-1.5 sm:px-3 sm:py-1.5">
                <Database className="h-3 w-3 text-teal-300 sm:h-3.5 sm:w-3.5" />
                ข้อมูล<span className="hidden sm:inline">ต้นทาง</span>ถึง {formatDateTime(summary.sourceAsOf)} น.
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-300/15 px-2.5 py-1 text-amber-100 sm:gap-1.5 sm:px-3 sm:py-1.5">
                <FlaskConical className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                D+2–D+7 <span className="hidden sm:inline">เป็นพยากรณ์</span>เชิงทดลอง
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border border-white/15 bg-white/10 px-3 py-2 backdrop-blur-sm sm:block sm:rounded-2xl sm:px-4 sm:py-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-teal-100/70 sm:text-[11px]">รอบคำนวณล่าสุด</p>
              <p className="text-xs font-bold sm:mt-1 sm:text-sm">{formatDateTime(summary.generatedAt)} น.</p>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-emerald-200 sm:mt-2 sm:gap-1.5 sm:text-xs">
              <CheckCircle2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              {summary.runStatus === "success" ? "ประมวลผลสำเร็จ" : "ประมวลผลบางส่วน"}
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          icon={<CircleGauge className="h-5 w-5" />}
          eyebrow={`ค่าเฉลี่ย D+1 · ${formatDate(d1Date)}`}
          value={`${summary.avgPm25D1.toFixed(1)}`}
          unit="µg/m³"
          detail={`AQI ${summary.avgAqiD1} · ${bandForPm25(summary.avgPm25D1).labelTh}`}
          color={bandForPm25(summary.avgPm25D1).color}
        />
        <KpiCard
          icon={<ArrowUpRight className="h-5 w-5" />}
          eyebrow="ค่าสูงสุด D+1"
          value={summary.worstD1?.nameTh ?? "-"}
          detail={worstD1Value != null ? `${worstD1Value.toFixed(1)} µg/m³` : "ไม่มีข้อมูล"}
          color={worstD1Value != null ? bandForPm25(worstD1Value).color : "#64748b"}
        />
        <KpiCard
          icon={<ShieldCheck className="h-5 w-5" />}
          eyebrow="จังหวัดเกิน 37.5"
          value={`${highRiskCount}`}
          unit="จังหวัด"
          detail={highRiskCount ? "ควรติดตามเป็นพิเศษ" : "ยังไม่พบพื้นที่เกินเกณฑ์"}
          color={highRiskCount ? "#f97316" : "#059669"}
        />
        <KpiCard
          icon={<TrendingUp className="h-5 w-5" />}
          eyebrow="แนวโน้มเพิ่ม D+1→D+7"
          value={`${risingCount}`}
          unit="จังหวัด"
          detail={`${summary.entries.length - risingCount} จังหวัดทรงตัวหรือลดลง`}
          color={risingCount ? "#e11d48" : "#059669"}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-12">
        <RegionalTrendPanel days={summary.dailyAverages} />
        <TopRiskPanel entries={topRisk} />
        <DataQualityPanel summary={summary} coveragePercent={coveragePercent} />
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200/80 p-4 dark:border-slate-800 sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                <h2 className="text-base font-black text-slate-950 dark:text-white">ตารางเปรียบเทียบ 7 วัน</h2>
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                แสดง PM2.5 (µg/m³) · คลิกชื่อจังหวัดเพื่อเปิดรายละเอียด
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
                {ZONES.map((zone) => {
                  const count = zone === "all"
                    ? summary.entries.length
                    : summary.entries.filter((entry) => entry.zone === zone).length;
                  return (
                    <button
                      key={zone}
                      type="button"
                      onClick={() => setZoneFilter(zone)}
                      className={`whitespace-nowrap rounded-lg px-3 py-2 text-[11px] font-bold transition ${
                        zoneFilter === zone
                          ? "bg-white text-teal-700 shadow-sm dark:bg-slate-700 dark:text-teal-300"
                          : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                      }`}
                    >
                      {THAI_ZONE_SHORT[zone]} <span className="opacity-60">{count}</span>
                    </button>
                  );
                })}
              </div>
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">
                <ArrowDownUp className="h-3.5 w-3.5" />
                <span className="sr-only">เรียงข้อมูล</span>
                <select
                  value={`${sortKey}:${sortAsc ? "asc" : "desc"}`}
                  onChange={(event) => {
                    const [key, direction] = event.target.value.split(":") as [SortKey, "asc" | "desc"];
                    setSortKey(key);
                    setSortAsc(direction === "asc");
                  }}
                  className="bg-transparent outline-none"
                >
                  <option value="d1:desc">D+1 สูง → ต่ำ</option>
                  <option value="d1:asc">D+1 ต่ำ → สูง</option>
                  <option value="current:desc">ปัจจุบัน สูง → ต่ำ</option>
                  <option value="d3:desc">D+3 สูง → ต่ำ</option>
                  <option value="trend:desc">แนวโน้มเพิ่มก่อน</option>
                  <option value="name:asc">ชื่อ ก → ฮ</option>
                </select>
              </label>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 text-slate-500 dark:bg-slate-950/40 dark:text-slate-400">
                <SortableHeader label="จังหวัด" sortKey="name" currentKey={sortKey} asc={sortAsc} onClick={handleSort} className="sticky left-0 z-20 min-w-44 bg-slate-50/95 pl-5 text-left dark:bg-slate-950" />
                <SortableHeader label="ปัจจุบัน" sortKey="current" currentKey={sortKey} asc={sortAsc} onClick={handleSort} className="min-w-24 text-center" />
                {summary.dailyAverages.map((day) => (
                  <th key={day.horizonDays} className="min-w-24 px-2 py-3 text-center font-semibold">
                    {day.horizonDays === 1 || day.horizonDays === 3 ? (
                      <button type="button" onClick={() => handleSort(day.horizonDays === 1 ? "d1" : "d3")} className="group inline-flex flex-col items-center gap-0.5 hover:text-teal-700 dark:hover:text-teal-300">
                        <span className="font-black text-slate-800 group-hover:text-teal-700 dark:text-slate-200">D+{day.horizonDays}</span>
                        <span className="text-[10px] font-medium">{formatDate(day.date)}</span>
                        {day.horizonDays > 1 && <span className="text-[9px] text-amber-600 dark:text-amber-400">ทดลอง</span>}
                      </button>
                    ) : (
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="font-black text-slate-800 dark:text-slate-200">D+{day.horizonDays}</span>
                        <span className="text-[10px] font-medium">{formatDate(day.date)}</span>
                        <span className="text-[9px] text-amber-600 dark:text-amber-400">ทดลอง</span>
                      </div>
                    )}
                  </th>
                ))}
                <SortableHeader label="แนวโน้ม" sortKey="trend" currentKey={sortKey} asc={sortAsc} onClick={handleSort} className="min-w-24 pr-5 text-center" />
              </tr>
            </thead>
            <tbody>
              {visibleEntries.map((entry) => (
                <ForecastRow key={entry.provinceId} entry={entry} days={summary.dailyAverages} />
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200/80 bg-slate-50/70 px-4 py-4 text-[11px] text-slate-500 dark:border-slate-800 dark:bg-slate-950/30 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {[15, 25, 37.5, 75, 76].map((value, index) => {
              const band = bandForPm25(value);
              return (
                <span key={`${value}-${index}`} className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: band.color }} />
                  {band.labelTh}
                </span>
              );
            })}
          </div>
          <span>จัดระดับจากค่าพยากรณ์ PM2.5 ตามเกณฑ์ 5 ระดับ</span>
        </div>
      </section>
    </div>
  );
}

function KpiCard({
  icon,
  eyebrow,
  value,
  unit,
  detail,
  color,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  value: string;
  unit?: string;
  detail: string;
  color: string;
}) {
  return (
    <article className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 sm:p-5">
      <div className="relative flex items-center gap-2 text-slate-500 dark:text-slate-400">
        <span style={{ color }}>{icon}</span>
        <span className="text-[10px] font-bold uppercase tracking-wider">{eyebrow}</span>
      </div>
      <div className="relative mt-3 flex items-baseline gap-1.5">
        <span className="text-xl font-black leading-none sm:text-2xl" style={{ color }}>{value}</span>
        {unit && <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{unit}</span>}
      </div>
      <p className="relative mt-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">{detail}</p>
    </article>
  );
}

function RegionalTrendPanel({ days }: { days: RegionalForecastDay[] }) {
  const chartData = days.map((day) => {
    const band = bandForPm25(day.avgPm25);
    return {
      name: `D+${day.horizonDays}`,
      dateStr: formatDate(day.date),
      fullLabel: `D+${day.horizonDays} · ${formatDate(day.date)}`,
      avgPm25: +day.avgPm25.toFixed(1),
      maxPm25: +day.maxPm25.toFixed(1),
      avgAqi: day.avgAqi,
      bandLabel: band.labelTh,
      bandColor: band.color,
      horizonDays: day.horizonDays,
    };
  });

  return (
    <article className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:col-span-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-black text-slate-950 dark:text-white">
            <Activity className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            แนวโน้มเฉลี่ยทั้งภาค 7 วัน
          </h2>
          <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <span className="h-2 w-2 rounded-full bg-teal-600" />
              ค่าเฉลี่ยทั้งภาค
            </span>
            <span className="inline-flex items-center gap-1.5 font-medium">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              ค่าสูงสุดรายวัน
            </span>
          </div>
        </div>
        <span className="rounded-full bg-teal-50 px-2.5 py-1 text-[10px] font-bold text-teal-700 dark:bg-teal-950/50 dark:text-teal-300">
          µg/m³
        </span>
      </div>

      <div className="mt-4 h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 12, right: 10, left: -24, bottom: 0 }}>
            <defs>
              <linearGradient id="regionalTrendGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0d9488" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#0d9488" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-slate-200/60 dark:text-slate-800/60" vertical={false} />
            <XAxis
              dataKey="name"
              tickLine={false}
              axisLine={false}
              tick={({ x, y, payload }) => {
                const item = chartData.find((d) => d.name === payload.value);
                return (
                  <g transform={`translate(${x},${y})`}>
                    <text x={0} y={12} textAnchor="middle" className="fill-slate-800 text-[10px] font-bold dark:fill-slate-200">
                      {payload.value}
                    </text>
                    <text x={0} y={23} textAnchor="middle" className="fill-slate-400 text-[8.5px] font-medium">
                      {item?.dateStr ?? ""}
                    </text>
                  </g>
                );
              }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              domain={[0, (dataMax: number) => Math.max(Math.ceil(dataMax * 1.25), 15)]}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                const d = payload[0].payload;
                const band = bandForPm25(d.avgPm25);
                return (
                  <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-3 text-xs shadow-lg backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95">
                    <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-1.5 dark:border-slate-800">
                      <span className="font-bold text-slate-900 dark:text-white">
                        {d.fullLabel}
                      </span>
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-black text-white"
                        style={{ backgroundColor: band.color }}
                      >
                        AQI {d.avgAqi} · {band.labelTh}
                      </span>
                    </div>
                    <div className="mt-2 space-y-1.5 text-[11px]">
                      <div className="flex items-center justify-between gap-4">
                        <span className="flex items-center gap-1.5 font-medium text-slate-500 dark:text-slate-400">
                          <span className="h-2 w-2 rounded-full bg-teal-600" />
                          ค่าเฉลี่ยทั้งภาค
                        </span>
                        <strong className="font-black tabular-nums text-teal-700 dark:text-teal-300">
                          {d.avgPm25} µg/m³
                        </strong>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="flex items-center gap-1.5 font-medium text-slate-500 dark:text-slate-400">
                          <span className="h-2 w-2 rounded-full bg-amber-500" />
                          ค่าสูงสุดของวัน
                        </span>
                        <strong className="font-black tabular-nums text-amber-600 dark:text-amber-400">
                          {d.maxPm25} µg/m³
                        </strong>
                      </div>
                    </div>
                  </div>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="avgPm25"
              stroke="#0d9488"
              strokeWidth={2.5}
              fill="url(#regionalTrendGradient)"
              dot={{ r: 3.5, fill: "#0d9488", strokeWidth: 2, stroke: "#ffffff" }}
              activeDot={{ r: 5, fill: "#0f766e", strokeWidth: 2, stroke: "#ffffff" }}
              name="ค่าเฉลี่ยทั้งภาค"
            />
            <Line
              type="monotone"
              dataKey="maxPm25"
              stroke="#f59e0b"
              strokeWidth={1.75}
              strokeDasharray="4 4"
              dot={{ r: 2.5, fill: "#f59e0b" }}
              name="ค่าสูงสุดของวัน"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}

function TopRiskPanel({ entries }: { entries: RegionalForecastEntry[] }) {
  return (
    <article className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:col-span-3">
      <h2 className="flex items-center gap-2 text-sm font-black text-slate-950 dark:text-white">
        <MapPin className="h-4 w-4 text-rose-500" />
        จังหวัดค่าฝุ่นสูง D+1
      </h2>
      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">เรียงจากค่าพยากรณ์สูงสุด</p>
      <div className="mt-4 space-y-2">
        {entries.map((entry, index) => {
          const value = entry.daily.find((day) => day.horizonDays === 1)?.pm25 ?? 0;
          const band = bandForPm25(value);
          return (
            <a key={entry.provinceId} href={`/forecast?province=${entry.provinceId}&tab=province`} className="group flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-slate-50 dark:hover:bg-slate-800/70">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-black" style={{ color: band.color, backgroundColor: `${band.color}16` }}>{index + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-slate-800 group-hover:text-teal-700 dark:text-slate-200 dark:group-hover:text-teal-300">{entry.nameTh}</p>
                <p className="mt-0.5 text-[10px] text-slate-400">{ZONE_LABELS[entry.zone].th}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-black tabular-nums" style={{ color: band.color }}>{value.toFixed(1)}</p>
                <p className="text-[9px] text-slate-400">µg/m³</p>
              </div>
              <ChevronRight className="h-3.5 w-3.5 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-teal-500" />
            </a>
          );
        })}
      </div>
    </article>
  );
}

function DataQualityPanel({ summary, coveragePercent }: { summary: RegionalForecastSummary; coveragePercent: number }) {
  const complete = summary.coverage.completeProvinces === summary.coverage.totalProvinces;
  return (
    <article className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:col-span-4">
      <h2 className="flex items-center gap-2 text-sm font-black text-slate-950 dark:text-white">
        <Database className="h-4 w-4 text-violet-500" />
        คุณภาพข้อมูลและวิธีพยากรณ์
      </h2>
      <div className="mt-4 rounded-2xl bg-slate-50 p-3.5 dark:bg-slate-800/60">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-600 dark:text-slate-300">ความครบถ้วน</span>
          <strong className={complete ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>{summary.coverage.forecastCells}/{summary.coverage.expectedCells} ค่า</strong>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-400" style={{ width: `${coveragePercent}%` }} />
        </div>
        <p className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">ครบ 7 วัน {summary.coverage.completeProvinces}/{summary.coverage.totalProvinces} จังหวัด</p>
      </div>
      <div className="mt-3 space-y-2.5 text-[11px]">
        {summary.modelBreakdown.map((item) => (
          <div key={item.model} className="flex items-center justify-between gap-3">
            <span className="truncate text-slate-500 dark:text-slate-400">{modelLabel(item.model)}</span>
            <strong className="shrink-0 text-slate-800 dark:text-slate-200">{item.provinces} จังหวัด</strong>
          </div>
        ))}
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-500 dark:text-slate-400">การจัดระดับอากาศ</span>
          <strong className="text-right text-slate-800 dark:text-slate-200">จากค่า PM2.5</strong>
        </div>
      </div>
      {summary.fallbackProvinces.length > 0 && (
        <div className="mt-4 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10px] leading-5 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span><strong>{summary.fallbackProvinces.join(", ")}</strong> ใช้ค่าเฉลี่ยข้อมูลล่าสุดแทนโมเดลหลัก</span>
        </div>
      )}
    </article>
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
  const active = currentKey === sortKey;
  return (
    <th className={`px-2 py-3 font-semibold ${className}`}>
      <button type="button" onClick={() => onClick(sortKey)} className={`inline-flex items-center gap-1 transition ${active ? "text-teal-700 dark:text-teal-300" : "hover:text-slate-900 dark:hover:text-white"}`}>
        {label}
        <span className="text-[9px]">{active ? (asc ? "↑" : "↓") : "↕"}</span>
      </button>
    </th>
  );
}

function ForecastRow({ entry, days }: { entry: RegionalForecastEntry; days: RegionalForecastDay[] }) {
  const currentBand = entry.currentPm25 != null ? bandForPm25(entry.currentPm25) : null;
  const trend = trendMeta(entry);
  return (
    <tr className="group border-t border-slate-100 transition hover:bg-teal-50/40 dark:border-slate-800 dark:hover:bg-teal-950/10">
      <td className="sticky left-0 z-10 bg-white px-2 py-3 pl-5 transition group-hover:bg-teal-50 dark:bg-slate-900 dark:group-hover:bg-slate-900">
        <a href={`/forecast?province=${entry.provinceId}&tab=province`} className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600 dark:bg-teal-950/50 dark:text-teal-300"><MapPin className="h-3.5 w-3.5" /></span>
          <span className="min-w-0">
            <span className="block truncate font-black text-slate-900 hover:text-teal-700 dark:text-white dark:hover:text-teal-300">{entry.nameTh}</span>
            <span className="block truncate text-[9px] font-medium text-slate-400">{ZONE_LABELS[entry.zone].th}{entry.usesRegressionFallback ? " · ใช้ค่าเฉลี่ย" : ""}</span>
          </span>
        </a>
      </td>
      <td className="px-2 py-3 text-center">
        {entry.currentPm25 == null ? <span className="text-slate-300">—</span> : (
          <div className="mx-auto flex min-w-14 max-w-16 flex-col items-center rounded-xl border px-2 py-1.5" style={{ color: currentBand?.color, borderColor: `${currentBand?.color}35`, backgroundColor: `${currentBand?.color}12` }}>
            <span className="font-black tabular-nums">{entry.currentPm25.toFixed(1)}</span>
            <span className="text-[8px] font-bold opacity-70">AQI {entry.currentAqi ?? "—"}</span>
          </div>
        )}
      </td>
      {days.map((day) => {
        const point = entry.daily.find((item) => item.horizonDays === day.horizonDays);
        if (!point) return <td key={day.horizonDays} className="px-2 py-3 text-center text-slate-300">—</td>;
        const band = bandForPm25(point.pm25);
        return (
          <td key={day.horizonDays} className="px-2 py-3 text-center">
            <div className="mx-auto flex min-w-14 max-w-16 flex-col items-center rounded-xl border px-2 py-1.5" style={{ color: band.color, borderColor: `${band.color}35`, backgroundColor: `${band.color}12` }} title={`${point.date}: PM2.5 ${point.pm25.toFixed(1)} µg/m³ · AQI ${point.aqi} · ${point.labelTh}`}>
              <span className="font-black tabular-nums">{point.pm25.toFixed(1)}</span>
              <span className="text-[8px] font-bold opacity-70">AQI {point.aqi}</span>
            </div>
          </td>
        );
      })}
      <td className="px-2 py-3 pr-5 text-center">
        <span className={`inline-flex items-center gap-1 font-bold ${trend.className}`}>
          <TrendIcon trend={entry.trend} />
          <span>{trend.label}</span>
        </span>
        <span className="mt-0.5 block text-[9px] tabular-nums text-slate-400">{trend.delta == null ? "—" : `${trend.delta > 0 ? "+" : ""}${trend.delta}`}</span>
      </td>
    </tr>
  );
}
