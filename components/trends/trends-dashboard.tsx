"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  Clock3,
  Info,
  Layers,
  Minus,
  RefreshCw,
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
  type TrendAnalysis,
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
  formatTrendRange,
  RANGE_OPTIONS,
  signedTrendValue,
} from "./trend-format";

/* ─── Trend Direction Badge ─── */
function TrendBadge({ analysis, compact = false }: { analysis: TrendAnalysis; compact?: boolean }) {
  const config = {
    improving: {
      label: "แนวโน้มดีขึ้น",
      icon: <TrendingDown size={compact ? 11 : 14} />,
      bg: "bg-emerald-100 dark:bg-emerald-950/60",
      text: "text-emerald-700 dark:text-emerald-300",
    },
    worsening: {
      label: "แนวโน้มสูงขึ้น",
      icon: <TrendingUp size={compact ? 11 : 14} />,
      bg: "bg-red-100 dark:bg-red-950/60",
      text: "text-red-700 dark:text-red-300",
    },
    stable: {
      label: "ทรงตัว",
      icon: <Minus size={compact ? 11 : 14} />,
      bg: "bg-zinc-100 dark:bg-zinc-800",
      text: "text-zinc-600 dark:text-zinc-300",
    },
    unknown: {
      label: "ข้อมูลไม่ครบ",
      icon: <Info size={compact ? 11 : 14} />,
      bg: "bg-zinc-100 dark:bg-zinc-800",
      text: "text-zinc-500 dark:text-zinc-400",
    },
  }[analysis.direction];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-black ${config.bg} ${config.text} ${
        compact ? "px-2 py-0.5 text-[9px]" : "px-2.5 py-1 text-[11px]"
      }`}
    >
      {config.icon}
      {config.label}
      {analysis.momentumDelta != null && (
        <span className="tabular-nums">{signedTrendValue(analysis.momentumDelta)}</span>
      )}
    </span>
  );
}

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
}: {
  province: IsanProvince;
  history: DailyPoint[];
  rangeDays: number;
  throughDate: string;
}) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "deepdive">("overview");

  const analysis = useMemo(
    () => analyzeTrendHistory(history, rangeDays, throughDate),
    [history, rangeDays, throughDate],
  );

  function navigate(nextProvince: string, nextRange: number) {
    router.push(`/trends?province=${encodeURIComponent(nextProvince)}&range=${nextRange}`);
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
            <p className="text-sm text-zinc-500">{province.nameTh}</p>
          </div>
          <div className="w-full sm:w-64">
            <ProvinceSelectModal
              selectedId={province.id}
              onSelect={(id) => navigate(id, rangeDays)}
            />
          </div>
        </div>
        <div className="rounded-2xl border border-zinc-100 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
          <EmptyState description="จังหวัดนี้ยังไม่มีข้อมูลรายวันที่ผ่านเกณฑ์สำหรับวิเคราะห์แนวโน้ม" />
        </div>
      </div>
    );
  }

  /* ─── Computed values ─── */
  const heroValue = analysis.latest7Average ?? analysis.current.averagePm25;
  const heroBand = bandForPm25(heroValue ?? 0);
  const exceedancePercent = analysis.current.observedDays
    ? Math.round((analysis.exceedanceDays / analysis.current.observedDays) * 100)
    : 0;
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

      {/* ─── CONTROLS BAR ─── */}
      <div className="flex flex-col gap-2.5 rounded-2xl border border-zinc-100 bg-white p-2.5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:w-64">
          <ProvinceSelectModal
            selectedId={province.id}
            onSelect={(id) => navigate(id, rangeDays)}
          />
        </div>
        <div className="no-scrollbar flex max-w-full gap-1 overflow-x-auto rounded-full bg-zinc-100 p-1 dark:bg-zinc-800">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.days}
              type="button"
              onClick={() => navigate(province.id, option.days)}
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

      {/* ─── COMPACT OVERVIEW CARDS ─── */}
      <section className="space-y-2">
        <h3 className="text-sm font-black text-zinc-900 dark:text-white">
          สรุปภาพรวม ({rangeDays} วันย้อนหลัง)
        </h3>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
          {/* 1. ค่าเฉลี่ย */}
          <div className="flex flex-col items-center justify-between rounded-2xl border border-sky-100/80 bg-sky-50/30 p-3 text-center dark:border-zinc-800 dark:bg-zinc-900/60 sm:p-3.5">
            <p className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 sm:text-[11px]">ค่าเฉลี่ย</p>
            <div className="my-1.5 flex items-baseline justify-center gap-1">
              <span className="text-2xl font-black tabular-nums tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
                {fmtPm25(heroValue)}
              </span>
              <span className="text-[10px] font-bold text-zinc-400">µg/m³</span>
            </div>
            <span
              className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-black text-white"
              style={{ backgroundColor: heroBand.color }}
            >
              {heroBand.labelTh}
            </span>
          </div>

          {/* 2. เทียบช่วงก่อนหน้า */}
          <div className="flex flex-col items-center justify-between rounded-2xl border border-zinc-100 bg-white p-3 text-center shadow-xs dark:border-zinc-800 dark:bg-zinc-900 sm:p-3.5">
            <p className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 sm:text-[11px]">เทียบช่วงก่อนหน้า</p>
            <div className="my-1.5">
              <p
                className={`text-2xl font-black tabular-nums tracking-tight sm:text-3xl ${
                  analysis.comparisonPercent == null
                    ? "text-zinc-400"
                    : comparisonWorse
                      ? "text-red-600 dark:text-red-400"
                      : "text-emerald-600 dark:text-emerald-400"
                }`}
              >
                {analysis.comparisonPercent == null
                  ? "-"
                  : `${comparisonWorse ? "↑" : "↓"}${Math.abs(analysis.comparisonPercent).toFixed(1)}%`}
              </p>
            </div>
            <p
              className={`text-[10px] font-bold ${
                analysis.comparisonPercent == null
                  ? "text-zinc-400"
                  : comparisonWorse
                    ? "text-red-600 dark:text-red-400"
                    : "text-emerald-600 dark:text-emerald-400"
              }`}
            >
              {analysis.comparisonPercent == null
                ? "ข้อมูลไม่เพียงพอ"
                : comparisonWorse
                  ? "สูงขึ้น"
                  : "ดีขึ้น"}
            </p>
          </div>

          {/* 3. วันฝุ่นเกินมาตรฐาน */}
          <div className="flex flex-col items-center justify-between rounded-2xl border border-zinc-100 bg-white p-3 text-center shadow-xs dark:border-zinc-800 dark:bg-zinc-900 sm:p-3.5">
            <p className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 sm:text-[11px]">วันฝุ่นเกินมาตรฐาน</p>
            <div className="my-1.5 flex items-baseline justify-center gap-1">
              <span className="text-2xl font-black tabular-nums tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
                {analysis.exceedanceDays}
              </span>
              <span className="text-[10px] font-bold text-zinc-400">วัน</span>
            </div>
            <p className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500">
              {exceedancePercent}% ของวันที่มีข้อมูล
            </p>
          </div>

          {/* 4. แนวโน้มปัจจุบัน */}
          <div className="flex flex-col items-center justify-between rounded-2xl border border-emerald-100/80 bg-emerald-50/30 p-3 text-center dark:border-emerald-950/60 dark:bg-emerald-950/20 sm:p-3.5">
            <p className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 sm:text-[11px]">แนวโน้มปัจจุบัน</p>
            <div className="my-1 flex flex-col items-center justify-center gap-1">
              <AqiFaceIcon level={pm25ToAqi(heroValue ?? 0)} size={34} className="drop-shadow-xs" />
              <TrendBadge analysis={analysis} compact />
            </div>
            <p className="w-full truncate text-[9px] font-semibold text-zinc-400 dark:text-zinc-500">
              {formatTrendRange(analysis.fromDate, analysis.anchorDate)}
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
          <HistoricalChart analysis={analysis} />
          <CalendarHeatmap analysis={analysis} />
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
          <DataQualityCard analysis={analysis} />
        </div>
      )}
    </div>
  );
}
