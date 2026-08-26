"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Award,
  BarChart3,
  ChevronRight,
  Clock3,
  Flame,
  Globe,
  Info,
  Layers,
  MapPin,
  RefreshCw,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { ProvinceSelectModal } from "@/components/ui/province-select-modal";
import { AqiFaceIcon } from "@/components/ui/aqi-face-icon";
import { EmptyState } from "@/components/ui/states";
import { bandForPm25, pm25ToAqi } from "@/lib/aqi";
import { fmtPm25 } from "@/lib/format";
import type { IsanProvince } from "@/lib/isan";
import {
  analyzeTrendHistory,
} from "@/lib/trends-insights";
import type { DailyPoint, ProvinceTrendSummary } from "@/services/daily-summary.service";
import { CalendarHeatmap, HistoricalChart } from "./trend-history-visuals";
import {
  BurningComparison,
  DataQualityCard,
  DriverChart,
  EpisodesCard,
  MonthlyPattern,
} from "./trend-insight-panels";
import {
  formatTrendDate,
  formatTrendDateFull,
  formatTrendObservedAt,
  formatTrendRange,
  RANGE_OPTIONS,
} from "./trend-format";

/* ─── Types ─── */
export type TrendViewMode = "regional" | "province";

/* ─── Tab Button ─── */
function TabButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[11px] font-black transition sm:text-xs ${
        active
          ? "bg-emerald-600 text-white shadow-sm"
          : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN DASHBOARD
   ═══════════════════════════════════════════════════════════════ */
export function TrendsDashboard({
  province,
  history,
  rangeDays,
  throughDate,
  viewMode = "province",
  rankings = [],
}: {
  province: IsanProvince | null;
  history: DailyPoint[];
  rangeDays: number;
  throughDate: string;
  viewMode?: TrendViewMode;
  rankings?: ProvinceTrendSummary[];
}) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "deepdive">("overview");

  const isRegional = viewMode === "regional";
  const displayName = isRegional ? "ทั้งภาคอีสาน (20 จังหวัด)" : province?.nameTh ?? "";

  const analysis = useMemo(
    () => analyzeTrendHistory(history, rangeDays, throughDate),
    [history, rangeDays, throughDate],
  );

  function navigate(nextProvince: string, nextRange: number) {
    router.push(`/trends?province=${encodeURIComponent(nextProvince)}&range=${nextRange}`);
  }

  function switchViewMode(mode: TrendViewMode) {
    if (mode === "regional") {
      router.push(`/trends?province=all&range=${rangeDays}`);
    } else {
      router.push(`/trends?province=${province?.id ?? "TH-40"}&range=${rangeDays}`);
    }
  }

  function refresh() {
    setRefreshing(true);
    router.refresh();
    window.setTimeout(() => setRefreshing(false), 700);
  }

  /* ─── Empty state ─── */
  if (!analysis.latestDataDate) {
    return (
      <div className="mx-auto max-w-5xl space-y-3.5 pb-8">
        {/* View Mode Toggle */}
        <ViewModeBar
          viewMode={viewMode}
          province={province}
          rangeDays={rangeDays}
          onSwitchMode={switchViewMode}
          onSelectProvince={(id) => navigate(id, rangeDays)}
          onSelectRange={(r) => navigate(isRegional ? "all" : (province?.id ?? "TH-40"), r)}
        />

        <div className="rounded-2xl border border-zinc-100 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
          <EmptyState description={isRegional
            ? "ยังไม่มีข้อมูลรายวันที่ผ่านเกณฑ์สำหรับวิเคราะห์ภาพรวมภูมิภาค"
            : "จังหวัดนี้ยังไม่มีข้อมูลรายวันที่ผ่านเกณฑ์สำหรับวิเคราะห์แนวโน้ม"
          } />
        </div>
      </div>
    );
  }

  /* ─── Computed values ─── */
  const periodAverage = analysis.current.averagePm25;
  const heroValue = periodAverage;
  const comparisonWorse = (analysis.comparisonDelta ?? 0) > 0;

  /* ─── Computed Peak and Cleanest Days ─── */
  const validPoints = analysis.calendar.filter((p) => p.pm25 != null);
  const peakPoint = validPoints.reduce<typeof analysis.calendar[0] | null>(
    (max, p) => (!max || p.pm25! > max.pm25! ? p : max),
    null,
  );
  const cleanestPoint = validPoints.reduce<typeof analysis.calendar[0] | null>(
    (min, p) => (!min || p.pm25! < min.pm25! ? p : min),
    null,
  );

  /* ─── Quality Days Breakdown ─── */
  const totalDays = validPoints.length || 1;
  const goodDaysCount = validPoints.filter((p) => (p.pm25 ?? 0) <= 15.0).length;
  const moderateDaysCount = validPoints.filter(
    (p) => (p.pm25 ?? 0) > 15.0 && (p.pm25 ?? 0) <= 37.5,
  ).length;
  const unhealthyDaysCount = validPoints.filter((p) => (p.pm25 ?? 0) > 37.5).length;

  const goodPct = Math.round((goodDaysCount / totalDays) * 100);
  const moderatePct = Math.round((moderateDaysCount / totalDays) * 100);
  const unhealthyPct = Math.round((unhealthyDaysCount / totalDays) * 100);

  const hasUnhealthyDay =
    unhealthyDaysCount > 0 ||
    (peakPoint != null && (peakPoint.pm25 ?? 0) > 37.5);

  /* ─── Province Rankings ─── */
  const topClean = rankings.slice(0, 5);
  const topPolluted = [...rankings].reverse().slice(0, 5);

  // If in province mode, find province's rank
  const currentProvinceRankIndex = province
    ? rankings.findIndex((r) => r.provinceId === province.id)
    : -1;
  const currentProvinceStat =
    currentProvinceRankIndex >= 0 ? rankings[currentProvinceRankIndex] : null;
  const rankNumber = currentProvinceRankIndex >= 0 ? currentProvinceRankIndex + 1 : null;
  const regionalAvgPm25 =
    rankings.length > 0
      ? +(rankings.reduce((s, r) => s + r.avgPm25, 0) / rankings.length).toFixed(1)
      : null;

  return (
    <div className="mx-auto max-w-5xl space-y-3.5 pb-8">
      {/* ─── UPDATE INFO BAR (SLEEK & MINIMALIST) ─── */}
      <div className="flex items-center justify-end gap-1.5 text-[11.5px] font-medium text-zinc-500 dark:text-zinc-400 px-1">
        <Clock3 size={12} className="shrink-0 text-zinc-400" />
        <span>
          {analysis.staleDays > 0
            ? `ข้อมูลล่าช้า ${analysis.staleDays} วัน`
            : `อัปเดต ${formatTrendObservedAt(analysis.latestTrustedObservedAt)}`}
        </span>
        <button
          type="button"
          onClick={refresh}
          className="rounded-full p-1 transition hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          title="โหลดข้อมูลใหม่"
        >
          <RefreshCw size={12} className={refreshing ? "animate-spin text-emerald-600" : ""} />
        </button>
      </div>

      {/* ─── VIEW MODE + CONTROLS BAR ─── */}
      <ViewModeBar
        viewMode={viewMode}
        province={province}
        rangeDays={rangeDays}
        onSwitchMode={switchViewMode}
        onSelectProvince={(id) => navigate(id, rangeDays)}
        onSelectRange={(r) => navigate(isRegional ? "all" : (province?.id ?? "TH-40"), r)}
      />

      {/* ─── COMPACT OVERVIEW CARDS ─── */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-zinc-900 dark:text-white">
            {isRegional ? `ภาพรวม 20 จังหวัดภาคอีสาน` : `สรุปภาพรวม ${province?.nameTh ?? ""}`} ({rangeDays} วันย้อนหลัง)
          </h3>
        </div>

        <div className="grid grid-cols-4 gap-1.5 sm:gap-3">
          {/* 1. ค่าเฉลี่ย */}
          <div className="flex flex-col items-center justify-between rounded-2xl border border-sky-100/80 bg-sky-50/40 p-2.5 text-center dark:border-zinc-800 dark:bg-zinc-900/60 sm:p-3.5">
            <p className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 sm:text-xs">
              {isRegional ? "ค่าเฉลี่ยภาค" : "ค่าเฉลี่ย"}
            </p>
            <div className="my-1 flex items-center justify-center">
              <span className="text-xl font-black tabular-nums tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
                {fmtPm25(periodAverage)}
              </span>
            </div>
            <p className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 sm:text-xs">
              µg/m³
            </p>
          </div>

          {/* 2. เทียบช่วงก่อนหน้า */}
          <div className="flex flex-col items-center justify-between rounded-2xl border border-zinc-100 bg-white p-2.5 text-center shadow-xs dark:border-zinc-800 dark:bg-zinc-900 sm:p-3.5">
            <p className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 sm:text-xs">
              {rangeDays >= 180
                ? `เทียบ ${rangeDays === 180 ? "6 เดือนก่อน" : "1 ปีก่อน"}`
                : `เทียบ ${rangeDays} วันก่อน`}
            </p>
            <div className="my-1 flex items-center justify-center">
              <p
                className={`text-xl font-black tabular-nums tracking-tight sm:text-3xl ${
                  analysis.comparisonPercent == null
                    ? "text-zinc-400"
                    : comparisonWorse
                      ? "text-red-600 dark:text-red-400"
                      : "text-emerald-600 dark:text-emerald-400"
                }`}
              >
                {analysis.comparisonPercent == null
                  ? "-"
                  : `${comparisonWorse ? "↑" : "↓"} ${Math.round(Math.abs(analysis.comparisonPercent))}%`}
              </p>
            </div>
            <p
              className={`text-[10px] font-bold sm:text-xs ${
                analysis.comparisonPercent == null
                  ? "text-zinc-400"
                  : comparisonWorse
                    ? "text-red-600 dark:text-red-400"
                    : "text-emerald-600 dark:text-emerald-400"
              }`}
            >
              {analysis.comparisonPercent == null
                ? "ไม่มีข้อมูล"
                : comparisonWorse
                  ? "ฝุ่นเพิ่มขึ้น"
                  : "ฝุ่นลดลง"}
            </p>
          </div>

          {/* 3. วันเกินมาตรฐาน */}
          <div className="flex flex-col items-center justify-between rounded-2xl border border-zinc-100 bg-white p-2.5 text-center shadow-xs dark:border-zinc-800 dark:bg-zinc-900 sm:p-3.5">
            <p className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 sm:text-xs">
              {isRegional ? "วันเกินเกณฑ์ (เฉลี่ยภาค)" : "วันเกินมาตรฐาน"}
            </p>
            <div className="my-1 flex items-center justify-center">
              <span className="text-xl font-black tabular-nums tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
                {analysis.exceedanceDays}
              </span>
            </div>
            <p className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 sm:text-xs">
              วัน
            </p>
          </div>

          {/* 4. แนวโน้มล่าสุด */}
          <div
            className={`flex flex-col items-center justify-between rounded-2xl border p-2.5 text-center sm:p-3.5 ${
              analysis.direction === "improving"
                ? "border-emerald-100/80 bg-emerald-50/40 dark:border-emerald-950/60 dark:bg-emerald-950/20"
                : analysis.direction === "worsening"
                  ? "border-red-100/80 bg-red-50/40 dark:border-red-950/60 dark:bg-red-950/20"
                  : "border-zinc-100 bg-white dark:border-zinc-800 dark:bg-zinc-900 shadow-xs"
            }`}
          >
            <p className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 sm:text-xs">แนวโน้มล่าสุด</p>
            <div className="my-1 flex items-center justify-center">
              <AqiFaceIcon level={pm25ToAqi(analysis.latest7Average ?? periodAverage ?? 0)} size={32} className="drop-shadow-xs sm:size-9" />
            </div>
            <p
              className={`text-[10px] font-bold sm:text-xs ${
                analysis.direction === "improving"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : analysis.direction === "worsening"
                    ? "text-red-600 dark:text-red-400"
                    : "text-zinc-500 dark:text-zinc-400"
              }`}
            >
              {analysis.direction === "improving"
                ? "ดีขึ้น (7 วัน)"
                : analysis.direction === "worsening"
                  ? "สูงขึ้น (7 วัน)"
                  : analysis.direction === "stable"
                    ? "ทรงตัว (7 วัน)"
                    : "ข้อมูลไม่ครบ"}
            </p>
          </div>
        </div>

        {/* ─── QUALITY DAYS & REGIONAL CONTEXT (CLEAN & MINIMALIST) ─── */}
        <div className="rounded-2xl border border-zinc-200/80 bg-white dark:border-zinc-800 dark:bg-zinc-900 p-4 sm:p-5 shadow-xs space-y-3.5">
          {/* Header: Title & Province Rank */}
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-zinc-900 dark:text-white">
              สัดส่วนคุณภาพอากาศ
            </h4>

            {!isRegional && province && rankNumber != null && (
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                อันดับ <strong className="text-emerald-600 dark:text-emerald-400 font-bold">{rankNumber}</strong> / 20 จังหวัด
              </span>
            )}
          </div>

          {/* Segmented Progress Bar */}
          <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800 flex gap-0.5">
            {goodDaysCount > 0 && (
              <div style={{ width: `${goodPct}%` }} className="h-full bg-emerald-500 rounded-full" />
            )}
            {moderateDaysCount > 0 && (
              <div style={{ width: `${moderatePct}%` }} className="h-full bg-amber-400 rounded-full" />
            )}
            {unhealthyDaysCount > 0 && (
              <div style={{ width: `${unhealthyPct}%` }} className="h-full bg-rose-500 rounded-full" />
            )}
          </div>

          {/* Legend: Spaced, Minimal & Clear */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-zinc-600 dark:text-zinc-400">
            {goodDaysCount > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                <span>อากาศดี <strong className="text-zinc-900 dark:text-white font-bold">{goodDaysCount} วัน</strong> ({goodPct}%)</span>
              </div>
            )}
            {moderateDaysCount > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" />
                <span>ปานกลาง <strong className="text-zinc-900 dark:text-white font-bold">{moderateDaysCount} วัน</strong> ({moderatePct}%)</span>
              </div>
            )}
            {unhealthyDaysCount > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-rose-500 shrink-0" />
                <span>เกินเกณฑ์ <strong className="text-zinc-900 dark:text-white font-bold">{unhealthyDaysCount} วัน</strong> ({unhealthyPct}%)</span>
              </div>
            )}
          </div>

          {/* ─── MILESTONE BOXES: 1 ROW DIVIDED INTO 2 COLUMNS ─── */}
          {cleanestPoint && (
            <div className="grid grid-cols-2 gap-2 sm:gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
              {/* Box 1: วันที่อากาศสะอาดที่สุด */}
              <div className="rounded-xl bg-zinc-50/70 dark:bg-zinc-800/40 p-2.5 sm:p-3.5 flex flex-col justify-between">
                <div>
                  <p className="text-[10px] sm:text-[11px] font-medium text-zinc-500 dark:text-zinc-400 truncate">
                    <span className="sm:hidden">อากาศดีที่สุด</span>
                    <span className="hidden sm:inline">วันที่อากาศสะอาดที่สุด</span>
                  </p>
                  <p className="text-[11px] sm:text-xs font-bold text-zinc-900 dark:text-white mt-0.5 truncate">
                    <span className="sm:hidden">{formatTrendDate(cleanestPoint.date)}</span>
                    <span className="hidden sm:inline">{formatTrendDateFull(cleanestPoint.date)}</span>
                  </p>
                  <p className="text-[9.5px] sm:text-[10.5px] text-zinc-400 mt-0.5 truncate">
                    {cleanestPoint.wind != null
                      ? `ลม ${(+cleanestPoint.wind).toFixed(1)} m/s`
                      : "คุณภาพอากาศดี"}
                  </p>
                </div>
                <div className="mt-1.5 sm:mt-2 text-right">
                  <span className="text-base sm:text-xl font-black tabular-nums text-emerald-600 dark:text-emerald-400">
                    {fmtPm25(cleanestPoint.pm25)}
                  </span>
                  <span className="text-[9px] sm:text-[10px] text-zinc-400 ml-1">µg/m³</span>
                </div>
              </div>

              {/* Box 2: วันที่ค่าฝุ่นสูงสุด */}
              {peakPoint && (() => {
                const peakMean = peakPoint.pm25 ?? 0;
                const isHigh = peakMean > 37.5;
                return (
                  <div className="rounded-xl bg-zinc-50/70 dark:bg-zinc-800/40 p-2.5 sm:p-3.5 flex flex-col justify-between">
                    <div>
                      <p className="text-[10px] sm:text-[11px] font-medium text-zinc-500 dark:text-zinc-400 truncate">
                        <span className="sm:hidden">ค่าฝุ่นสูงสุด</span>
                        <span className="hidden sm:inline">{isHigh ? "วันที่ค่าฝุ่นเกินเกณฑ์สูงสุด" : "วันที่ค่าฝุ่นสูงสุด"}</span>
                      </p>
                      <p className="text-[11px] sm:text-xs font-bold text-zinc-900 dark:text-white mt-0.5 truncate">
                        <span className="sm:hidden">{formatTrendDate(peakPoint.date)}</span>
                        <span className="hidden sm:inline">{formatTrendDateFull(peakPoint.date)}</span>
                      </p>
                      <p className="text-[9.5px] sm:text-[10.5px] text-zinc-400 mt-0.5 truncate">
                        {peakPoint.pm25Max != null && peakPoint.pm25Max > peakMean
                          ? `สูงสุด ${fmtPm25(peakPoint.pm25Max)} µg/m³`
                          : peakPoint.wind != null
                          ? `ลม ${(+peakPoint.wind).toFixed(1)} m/s`
                          : "คุณภาพอากาศปกติ"}
                      </p>
                    </div>
                    <div className="mt-1.5 sm:mt-2 text-right">
                      <span className={`text-base sm:text-xl font-black tabular-nums ${isHigh ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400"}`}>
                        {fmtPm25(peakMean)}
                      </span>
                      <span className="text-[9px] sm:text-[10px] text-zinc-400 ml-1">µg/m³</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </section>

      {/* ─── COVERAGE WARNING ─── */}
      {!analysis.comparisonReliable && analysis.previous.observedDays > 0 && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[11px] text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          <Info size={14} className="mt-0.5 shrink-0" />
          <p className="leading-relaxed">
            ไม่แสดงการเปรียบเทียบสถิติช่วงก่อนหน้า เนื่องจากความสมบูรณ์ของข้อมูลต่ำกว่า 80%
            หรือต่างกันเกิน 10%
          </p>
        </div>
      )}

      {/* ─── REGIONAL NOTE ─── */}
      {isRegional && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-sky-200 bg-sky-50 px-3.5 py-3 text-[11px] text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-200">
          <Globe size={14} className="mt-0.5 shrink-0" />
          <p className="leading-relaxed">
            กำลังแสดง<strong>ค่าเฉลี่ยรวมทั้ง 20 จังหวัดภาคอีสาน</strong>
            {" "}ช่วงต่ำสุด–สูงสุดในกราฟแสดงจังหวัดที่มีฝุ่นต่ำที่สุดและสูงที่สุดในวันนั้น
          </p>
        </div>
      )}

      {/* ─── TAB NAVIGATION ─── */}
      <div className="flex gap-1.5 rounded-2xl border border-zinc-100 bg-white p-1.5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
        <TabButton
          active={activeTab === "overview"}
          icon={<BarChart3 size={14} />}
          label="ภาพรวมแนวโน้ม"
          onClick={() => setActiveTab("overview")}
        />
        <TabButton
          active={activeTab === "deepdive"}
          icon={<Layers size={14} />}
          label="วิเคราะห์เชิงลึก & สภาพอากาศ"
          onClick={() => setActiveTab("deepdive")}
        />
      </div>

      {/* ─── TAB: OVERVIEW ─── */}
      {activeTab === "overview" && (
        <div className="space-y-4">
          <HistoricalChart analysis={analysis} isRegional={isRegional} />
          <CalendarHeatmap analysis={analysis} isRegional={isRegional} />

          {/* ─── PROVINCE LEADERBOARDS: TOP 5 CLEAN VS TOP 5 POLLUTED (Regional View Only) ─── */}
          {isRegional && rankings.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 🔴 Top 5 Highest PM2.5 */}
              <div className="rounded-2xl border border-zinc-200/80 bg-white dark:border-zinc-800 dark:bg-zinc-900 p-4 shadow-xs space-y-3">
                <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2.5">
                  <div className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white">
                    5 อันดับจังหวัดค่าฝุ่นสูงสุด
                  </div>
                  <span className="text-[10px] text-zinc-400">เฉลี่ย {rangeDays} วัน</span>
                </div>

                <div className="space-y-1">
                  {topPolluted.map((p, idx) => {
                    const band = bandForPm25(p.avgPm25);
                    return (
                      <button
                        key={p.provinceId}
                        type="button"
                        onClick={() => navigate(p.provinceId, rangeDays)}
                        className="w-full flex items-center justify-between rounded-xl px-2.5 py-2 transition hover:bg-zinc-50 dark:hover:bg-zinc-800/60 text-left group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-zinc-100 dark:bg-zinc-800 text-[10px] font-bold text-zinc-600 dark:text-zinc-400 shrink-0">
                            {idx + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-zinc-900 dark:text-white truncate group-hover:text-emerald-600 transition">
                              {p.nameTh}
                            </p>
                            <p className="text-[10px] text-zinc-400">
                              เกินเกณฑ์ {p.exceedanceDays} วัน
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            <span className="text-xs sm:text-sm font-bold tabular-nums" style={{ color: band.color }}>
                              {p.avgPm25}
                            </span>
                            <span className="text-[9px] text-zinc-400 block -mt-0.5">µg/m³</span>
                          </div>
                          <ChevronRight size={13} className="text-zinc-300 group-hover:text-zinc-600 transition" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 🟢 Top 5 Cleanest Air */}
              <div className="rounded-2xl border border-zinc-200/80 bg-white dark:border-zinc-800 dark:bg-zinc-900 p-4 shadow-xs space-y-3">
                <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2.5">
                  <div className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white">
                    5 อันดับจังหวัดอากาศดีที่สุด
                  </div>
                  <span className="text-[10px] text-zinc-400">เฉลี่ย {rangeDays} วัน</span>
                </div>

                <div className="space-y-1">
                  {topClean.map((p, idx) => {
                    const band = bandForPm25(p.avgPm25);
                    return (
                      <button
                        key={p.provinceId}
                        type="button"
                        onClick={() => navigate(p.provinceId, rangeDays)}
                        className="w-full flex items-center justify-between rounded-xl px-2.5 py-2 transition hover:bg-zinc-50 dark:hover:bg-zinc-800/60 text-left group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-zinc-100 dark:bg-zinc-800 text-[10px] font-bold text-zinc-600 dark:text-zinc-400 shrink-0">
                            {idx + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-zinc-900 dark:text-white truncate group-hover:text-emerald-600 transition">
                              {p.nameTh}
                            </p>
                            <p className="text-[10px] text-zinc-400">
                              อากาศดี {p.cleanDays} วัน
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            <span className="text-xs sm:text-sm font-bold tabular-nums" style={{ color: band.color }}>
                              {p.avgPm25}
                            </span>
                            <span className="text-[9px] text-zinc-400 block -mt-0.5">µg/m³</span>
                          </div>
                          <ChevronRight size={13} className="text-zinc-300 group-hover:text-zinc-600 transition" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <section className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
            <MonthlyPattern analysis={analysis} />
            <BurningComparison analysis={analysis} />
          </section>
        </div>
      )}

      {/* ─── TAB: DEEP-DIVE ─── */}
      {activeTab === "deepdive" && (
        <div className="space-y-4">
          <section className="grid gap-4 lg:grid-cols-2">
            <DriverChart analysis={analysis} />
            <EpisodesCard analysis={analysis} />
          </section>
          <DataQualityCard analysis={analysis} isRegional={isRegional} />
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   VIEW MODE BAR
   ═══════════════════════════════════════════════════════════════ */
function ViewModeBar({
  viewMode,
  province,
  rangeDays,
  onSwitchMode,
  onSelectProvince,
  onSelectRange,
}: {
  viewMode: TrendViewMode;
  province: IsanProvince | null;
  rangeDays: number;
  onSwitchMode: (mode: TrendViewMode) => void;
  onSelectProvince: (id: string) => void;
  onSelectRange: (range: number) => void;
}) {
  const isRegional = viewMode === "regional";

  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-zinc-100 bg-white p-2.5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 sm:flex-row sm:items-center sm:justify-between">
      {/* Left: View mode toggle + Province selector */}
      <div className="flex items-center gap-2">
        {/* Segmented Control: ภาพรวมทั้งภาค / เจาะลึกรายจังหวัด */}
        <div className="no-scrollbar flex gap-0.5 rounded-full bg-zinc-100 p-0.5 dark:bg-zinc-800">
          <button
            type="button"
            onClick={() => onSwitchMode("regional")}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-black transition sm:text-xs ${
              isRegional
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-white"
            }`}
          >
            <Globe size={13} />
            <span className="hidden sm:inline">ภาพรวมทั้งภาคอีสาน</span>
            <span className="sm:hidden">ทั้งภาค</span>
          </button>
          <button
            type="button"
            onClick={() => onSwitchMode("province")}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-black transition sm:text-xs ${
              !isRegional
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-white"
            }`}
          >
            <MapPin size={13} />
            <span className="hidden sm:inline">เจาะลึกรายจังหวัด</span>
            <span className="sm:hidden">รายจังหวัด</span>
          </button>
        </div>

        {/* Province Selector — only active in province mode */}
        {!isRegional && (
          <div className="w-40 sm:w-52">
            <ProvinceSelectModal
              selectedId={province?.id ?? "TH-40"}
              onSelect={onSelectProvince}
            />
          </div>
        )}
        {isRegional && (
          <span className="flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[11px] font-bold text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-300">
            <Globe size={12} />
            20 จังหวัดภาคอีสาน
          </span>
        )}
      </div>

      {/* Right: Range presets */}
      <div className="no-scrollbar flex max-w-full gap-1 overflow-x-auto rounded-full bg-zinc-100 p-1 dark:bg-zinc-800">
        {RANGE_OPTIONS.map((option) => (
          <button
            key={option.days}
            type="button"
            onClick={() => onSelectRange(option.days)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-[11px] font-bold transition sm:text-xs ${
              rangeDays === option.days
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-white"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
