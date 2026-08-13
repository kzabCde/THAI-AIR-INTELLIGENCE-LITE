"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  Clock3,
  Globe,
  Info,
  Layers,
  MapPin,
  RefreshCw,
} from "lucide-react";
import { ProvinceSelectModal } from "@/components/ui/province-select-modal";
import { AqiFaceIcon } from "@/components/ui/aqi-face-icon";
import { EmptyState } from "@/components/ui/states";
import { pm25ToAqi } from "@/lib/aqi";
import { fmtPm25 } from "@/lib/format";
import type { IsanProvince } from "@/lib/isan";
import {
  analyzeTrendHistory,
} from "@/lib/trends-insights";
import type { DailyPoint } from "@/services/daily-summary.service";
import { CalendarHeatmap, HistoricalChart } from "./trend-history-visuals";
import {
  BurningComparison,
  DataQualityCard,
  DriverChart,
  EpisodesCard,
  MonthlyPattern,
} from "./trend-insight-panels";
import {
  formatTrendObservedAt,
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
}: {
  province: IsanProvince | null;
  history: DailyPoint[];
  rangeDays: number;
  throughDate: string;
  viewMode?: TrendViewMode;
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
      <div className="mx-auto max-w-5xl space-y-4 pb-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-black tracking-tight text-zinc-900 dark:text-white sm:text-2xl">
              แนวโน้มย้อนหลัง
            </h1>
            <p className="text-sm text-zinc-500">{displayName}</p>
          </div>
        </div>

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
  const heroValue = analysis.latest7Average ?? analysis.current.averagePm25;
  const comparisonWorse = (analysis.comparisonDelta ?? 0) > 0;

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-8">
      {/* ─── HEADER ─── */}
      <header>
        <h1 className="text-xl font-black tracking-tight text-zinc-900 dark:text-white sm:text-2xl">
          แนวโน้มย้อนหลัง
        </h1>
        <div
          className={`mt-1 flex items-center gap-1.5 text-[11px] font-bold ${
            analysis.staleDays > 0
              ? "text-amber-600 dark:text-amber-400"
              : "text-zinc-400 dark:text-zinc-500"
          }`}
        >
          <Clock3 size={12} />
          <span>
            {analysis.staleDays > 0
              ? `ล่าช้า ${analysis.staleDays} วัน`
              : `อัปเดต ${formatTrendObservedAt(analysis.latestTrustedObservedAt)}`}
          </span>
          <button
            type="button"
            onClick={refresh}
            className="rounded-full p-1 transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
            title="โหลดข้อมูลใหม่"
          >
            <RefreshCw size={12} className={refreshing ? "animate-spin text-emerald-600" : ""} />
          </button>
        </div>
      </header>

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
      <section className="space-y-2">
        <h3 className="text-sm font-black text-zinc-900 dark:text-white">
          {isRegional ? `ภาพรวม 20 จังหวัดภาคอีสาน` : `สรุปภาพรวม`} ({rangeDays} วันย้อนหลัง)
        </h3>
        <div className="grid grid-cols-4 gap-1.5 sm:gap-3">
          {/* 1. ค่าเฉลี่ย */}
          <div className="flex flex-col items-center justify-between rounded-2xl border border-sky-100/80 bg-sky-50/40 p-2.5 text-center dark:border-zinc-800 dark:bg-zinc-900/60 sm:p-3.5">
            <p className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 sm:text-xs">
              {isRegional ? "ค่าเฉลี่ยภาค" : "ค่าเฉลี่ย"}
            </p>
            <div className="my-1 flex items-center justify-center">
              <span className="text-xl font-black tabular-nums tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
                {fmtPm25(heroValue)}
              </span>
            </div>
            <p className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 sm:text-xs">
              µg/m³
            </p>
          </div>

          {/* 2. เทียบช่วงก่อนหน้า */}
          <div className="flex flex-col items-center justify-between rounded-2xl border border-zinc-100 bg-white p-2.5 text-center shadow-xs dark:border-zinc-800 dark:bg-zinc-900 sm:p-3.5">
            <p className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 sm:text-xs">เทียบช่วงก่อนหน้า</p>
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
                  ? "สูงขึ้น"
                  : "ดีขึ้น"}
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
              <AqiFaceIcon level={pm25ToAqi(heroValue ?? 0)} size={32} className="drop-shadow-xs sm:size-9" />
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
                ? "ดีขึ้น"
                : analysis.direction === "worsening"
                  ? "สูงขึ้น"
                  : analysis.direction === "stable"
                    ? "ทรงตัว"
                    : "ข้อมูลไม่ครบ"}
            </p>
          </div>
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
