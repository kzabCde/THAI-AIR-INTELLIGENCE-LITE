"use client";

import { useState } from "react";
import { Activity, CalendarDays, Droplets, Flame, Info, Thermometer, Wind, X } from "lucide-react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AQI_BANDS, bandForPm25 } from "@/lib/aqi";
import { fmtPm25 } from "@/lib/format";
import { THAI_PM25_STANDARD, type TrendAnalysis, type TrendCalendarPoint } from "@/lib/trends-insights";
import { EmptyState } from "@/components/ui/states";
import {
  formatTrendDate,
  formatTrendDateFull,
  formatTrendRange,
  parseDateKey,
  PM25_LEGEND,
} from "./trend-format";

const WEEKDAY_LABELS = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];

export function HistoricalChart({ analysis, isRegional = false }: { analysis: TrendAnalysis; isRegional?: boolean }) {
  const data = analysis.calendar.map((point) => ({
    ...point,
    label: formatTrendDate(point.date),
    rangeBase: point.pm25Min ?? null,
    rangeBand:
      point.pm25Min != null && point.pm25Max != null
        ? Math.max(0, point.pm25Max - point.pm25Min)
        : null,
  }));

  return (
    <section className="rounded-3xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-orange-100 p-1.5 text-orange-600 dark:bg-orange-950/50 dark:text-orange-300">
              <Activity size={15} />
            </span>
            <h2 className="text-sm font-black text-fg sm:text-base">
              {isRegional ? "เส้นเวลาฝุ่น PM2.5 ภาคอีสาน" : "เส้นเวลาฝุ่น PM2.5"}
            </h2>
          </div>
          <p className="mt-1 text-xs text-muted">
            {isRegional
              ? "ค่าเฉลี่ย 20 จังหวัด ช่วงจังหวัดต่ำสุด–สูงสุด และเฉลี่ยเคลื่อนที่ 7 วัน"
              : "ค่าเฉลี่ยรายวัน ช่วงต่ำสุด–สูงสุด และค่าเฉลี่ยเคลื่อนที่เมื่อมีข้อมูลครบ 7/7 วัน"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[10px] font-semibold text-muted sm:text-xs">
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-orange-500" />{isRegional ? "เฉลี่ยภาค" : "รายวัน"}</span>
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-emerald-500" />เฉลี่ย 7 วัน</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-4 rounded bg-orange-200/70" />{isRegional ? "จังหวัดต่ำสุด–สูงสุด" : "ต่ำสุด–สูงสุด"}</span>
        </div>
      </div>

      <div className="mt-4 h-72 w-full sm:h-80">
        {data.some((point) => point.pm25 != null) ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="trend-range-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fb923c" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#fb923c" stopOpacity={0.08} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(148 163 184 / 0.18)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "#64748b" }}
                axisLine={false}
                tickLine={false}
                minTickGap={42}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#64748b" }}
                axisLine={false}
                tickLine={false}
                width={42}
                domain={[0, (maximum: number) => Math.max(50, Math.ceil(maximum * 1.15))]}
              />
              <Tooltip
                cursor={{ stroke: "#94a3b8", strokeDasharray: "3 3" }}
                content={({ active, payload }) => {
                  const point = payload?.[0]?.payload as (typeof data)[number] | undefined;
                  if (!active || !point) return null;
                  return (
                    <div className="min-w-44 rounded-xl border border-border bg-surface/95 p-3 text-xs shadow-soft backdrop-blur">
                      <p className="font-bold text-fg">{formatTrendDate(point.date, true)}</p>
                      <div className="mt-1.5 space-y-1 text-muted">
                        <p>{isRegional ? "เฉลี่ยภาค" : "เฉลี่ย"} <strong className="text-fg">{fmtPm25(point.pm25)} µg/m³</strong></p>
                        <p>{isRegional ? "จังหวัดต่ำสุด–สูงสุด" : "ต่ำสุด–สูงสุด"} {fmtPm25(point.pm25Min)}–{fmtPm25(point.pm25Max)} µg/m³</p>
                        <p>เฉลี่ย 7 วัน {fmtPm25(point.rolling7)} µg/m³</p>
                        <p>ข้อมูล {point.hoursAvailable ?? 0}/24 ชั่วโมง</p>
                      </div>
                    </div>
                  );
                }}
              />
              <ReferenceLine
                y={THAI_PM25_STANDARD}
                stroke="#f97316"
                strokeDasharray="5 5"
                label={{ value: "เกณฑ์อ้างอิง 37.5", fill: "#ea580c", fontSize: 10, position: "insideTopRight" }}
              />
              <ReferenceLine y={75} stroke="#ef4444" strokeDasharray="3 5" />
              <Area
                type="monotone"
                dataKey="rangeBase"
                stackId="range"
                stroke="none"
                fill="transparent"
                connectNulls={false}
                tooltipType="none"
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="rangeBand"
                stackId="range"
                stroke="none"
                fill="url(#trend-range-fill)"
                connectNulls={false}
                tooltipType="none"
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="pm25"
                name="PM2.5 รายวัน"
                stroke="#f97316"
                strokeWidth={1.8}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="rolling7"
                name="เฉลี่ย 7 วัน"
                stroke="#10b981"
                strokeWidth={2.8}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState description="ยังไม่มีข้อมูล PM2.5 ในช่วงเวลาที่เลือก" />
        )}
      </div>

      <div className="mt-2 flex items-start gap-2 rounded-xl bg-surface-2 px-3 py-2 text-[11px] text-muted">
        <Info size={13} className="mt-0.5 shrink-0" />
        <p>{isRegional
          ? "แสดงค่าเฉลี่ยของ 20 จังหวัดในแต่ละวัน ช่วงว่างคือวันที่ไม่มีข้อมูลเพียงพอจากจังหวัดใดๆ"
          : "ช่องว่างคือวันที่ไม่มีข้อมูลที่ผ่านเกณฑ์อย่างน้อย 18 ชั่วโมง ระบบไม่ลากเส้นเชื่อมข้ามวันที่ข้อมูลหาย"}</p>
      </div>
    </section>
  );
}

export function CalendarHeatmap({ analysis, isRegional = false }: { analysis: TrendAnalysis; isRegional?: boolean }) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  if (!analysis.calendar.length) return null;

  const firstDate = analysis.calendar[0]?.date ? parseDateKey(analysis.calendar[0].date) : null;
  const rawDay = firstDate && !Number.isNaN(firstDate.getTime()) ? firstDate.getUTCDay() : 0;
  const firstWeekday = (rawDay + 6) % 7;
  const safeWeekday = Number.isNaN(firstWeekday) || firstWeekday < 0 ? 0 : firstWeekday;
  const cells: Array<TrendCalendarPoint | null> = [
    ...Array.from({ length: safeWeekday }, () => null),
    ...analysis.calendar,
  ];

  const activeDate = hoveredDate ?? selectedDate;
  const activePoint = activeDate
    ? analysis.calendar.find((p) => p.date === activeDate)
    : null;

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarDays size={18} className="text-emerald-600 dark:text-emerald-400" />
          <div>
            <h2 className="text-sm font-black text-fg sm:text-base">
              {isRegional ? "ปฏิทินคุณภาพอากาศภาคอีสาน" : "ปฏิทินคุณภาพอากาศ"}
            </h2>
            <p className="text-[11px] text-muted">
              {isRegional
                ? "แต่ละช่องแสดงค่าเฉลี่ย 20 จังหวัด แตะเพื่อดูรายละเอียด"
                : "แตะหรือคลิกที่ช่องปฏิทินเพื่อดูรายละเอียดของวันนั้น"}
            </p>
          </div>
        </div>
        <span className="rounded-full border border-border/60 bg-surface-2 px-2.5 py-1 text-[10px] font-bold text-muted">
          {formatTrendRange(analysis.fromDate, analysis.anchorDate)}
        </span>
      </div>

      {/* Heatmap Grid */}
      <div className="mt-4 flex gap-2 sm:gap-3">
        <div className="grid shrink-0 grid-rows-7 gap-1 text-[10px] font-bold text-muted">
          {WEEKDAY_LABELS.map((day) => (
            <span key={day} className="flex h-3.5 w-5 items-center sm:h-4">
              {day}
            </span>
          ))}
        </div>
        <div className="no-scrollbar overflow-x-auto pb-2">
          <div className="grid w-max grid-flow-col grid-rows-7 gap-1">
            {cells.map((point, index) => {
              if (!point) return <span key={`blank-${index}`} className="h-3.5 w-3.5 sm:h-4 sm:w-4" />;
              const band = point.pm25 == null ? null : bandForPm25(point.pm25);
              const isSelected = selectedDate === point.date;
              const isHovered = hoveredDate === point.date;
              const title = point.pm25 == null
                ? `${formatTrendDate(point.date, true)}: ไม่มีข้อมูล`
                : `${formatTrendDate(point.date, true)}: ${fmtPm25(point.pm25)} µg/m³`;

              return (
                <button
                  key={point.date}
                  type="button"
                  onClick={() => setSelectedDate(isSelected ? null : point.date)}
                  onMouseEnter={() => setHoveredDate(point.date)}
                  onMouseLeave={() => setHoveredDate(null)}
                  className={`h-3.5 w-3.5 sm:h-4 sm:w-4 rounded-[4px] border transition-all duration-150 relative cursor-pointer focus:outline-none ${
                    point.hoursAvailable != null && point.hoursAvailable < 24
                      ? "border-slate-600/40"
                      : "border-transparent"
                  } ${
                    isSelected
                      ? "ring-2 ring-emerald-500 scale-125 z-20 shadow-md"
                      : isHovered
                      ? "ring-2 ring-emerald-400 scale-125 z-10"
                      : "hover:scale-110 hover:z-10"
                  }`}
                  style={{ backgroundColor: band?.color ?? "rgb(203 213 225 / 0.55)" }}
                  title={title}
                  aria-label={title}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border/50 pt-3 text-[10px] font-semibold text-muted">
        {AQI_BANDS.map((band, index) => (
          <span key={band.level} className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: band.color }} />
            {band.labelTh} {PM25_LEGEND[index]}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-slate-300 dark:bg-slate-700" />
          ไม่มีข้อมูล
        </span>
      </div>

      {/* Interactive Detail Card */}
      <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-50/40 p-3.5 transition-all dark:border-emerald-900/40 dark:bg-emerald-950/20">
        {activePoint ? (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2 border-b border-emerald-200/60 pb-2 dark:border-emerald-800/60">
              <div className="flex items-center gap-2">
                <span
                  className="h-3.5 w-3.5 shrink-0 rounded-full shadow-xs"
                  style={{
                    backgroundColor:
                      activePoint.pm25 != null
                        ? bandForPm25(activePoint.pm25).color
                        : "rgb(203 213 225)",
                  }}
                />
                <h4 className="text-xs font-bold text-fg sm:text-sm">
                  {formatTrendDateFull(activePoint.date)}
                </h4>
              </div>
              {selectedDate && (
                <button
                  type="button"
                  onClick={() => setSelectedDate(null)}
                  className="rounded-lg p-1 text-muted transition hover:bg-surface hover:text-fg"
                  title="ปิดรายละเอียด"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              {/* PM2.5 */}
              <div className="rounded-lg border border-border/50 bg-surface/90 p-2">
                <p className="text-[10px] font-semibold text-muted">{isRegional ? "PM2.5 เฉลี่ยภาค" : "ค่า PM2.5 เฉลี่ย"}</p>
                <p className="mt-0.5 text-base font-black tabular-nums text-fg">
                  {fmtPm25(activePoint.pm25)}{" "}
                  <span className="text-[10px] font-normal text-muted">µg/m³</span>
                </p>
                {activePoint.pm25 != null && (
                  <p className="text-[10px] font-bold" style={{ color: bandForPm25(activePoint.pm25).color }}>
                    {bandForPm25(activePoint.pm25).labelTh}
                  </p>
                )}
              </div>

              {/* Min - Max */}
              <div className="rounded-lg border border-border/50 bg-surface/90 p-2">
                <p className="text-[10px] font-semibold text-muted">{isRegional ? "จังหวัดต่ำสุด–สูงสุด" : "ช่วงต่ำสุด–สูงสุด"}</p>
                <p className="mt-0.5 text-xs font-bold tabular-nums text-fg">
                  {fmtPm25(activePoint.pm25Min)} – {fmtPm25(activePoint.pm25Max)}
                </p>
                <p className="text-[10px] text-muted">{isRegional ? "µg/m³ ข้ามจังหวัด" : "µg/m³ ในรอบวัน"}</p>
              </div>

              {/* 7-day Rolling */}
              <div className="rounded-lg border border-border/50 bg-surface/90 p-2">
                <p className="text-[10px] font-semibold text-muted">เฉลี่ย 7 วัน</p>
                <p className="mt-0.5 text-xs font-bold tabular-nums text-fg">
                  {fmtPm25(activePoint.rolling7)} µg/m³
                </p>
                <p className="text-[10px] text-muted">ค่าเฉลี่ยเคลื่อนที่</p>
              </div>

              {/* Data Hours */}
              <div className="rounded-lg border border-border/50 bg-surface/90 p-2">
                <p className="text-[10px] font-semibold text-muted">ความสมบูรณ์ข้อมูล</p>
                <p className="mt-0.5 text-xs font-bold tabular-nums text-fg">
                  {activePoint.hoursAvailable ?? 0} / 24 ชม.
                </p>
                <p className="text-[10px] text-muted">
                  {Math.round(((activePoint.hoursAvailable ?? 0) / 24) * 100)}% ครบถ้วน
                </p>
              </div>
            </div>

            {/* Weather & Hotspots */}
            {(activePoint.temp != null || activePoint.humidity != null || activePoint.wind != null || activePoint.hotspots != null) && (
              <div className="flex flex-wrap items-center gap-3 border-t border-border/40 pt-1 text-[11px] font-medium text-muted">
                {activePoint.temp != null && (
                  <span className="flex items-center gap-1">
                    <Thermometer size={12} className="text-orange-500" />
                    {activePoint.temp.toFixed(1)}°C
                  </span>
                )}
                {activePoint.humidity != null && (
                  <span className="flex items-center gap-1">
                    <Droplets size={12} className="text-blue-500" />
                    {activePoint.humidity.toFixed(0)}%
                  </span>
                )}
                {activePoint.wind != null && (
                  <span className="flex items-center gap-1">
                    <Wind size={12} className="text-teal-500" />
                    {activePoint.wind.toFixed(1)} km/h
                  </span>
                )}
                {activePoint.hotspots != null && (
                  <span className="flex items-center gap-1">
                    <Flame size={12} className="text-red-500" />
                    {activePoint.hotspots} จุดความร้อน
                  </span>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <Info size={14} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>แตะหรือคลิกที่ช่องวันที่ในปฏิทิน เพื่อดูค่า PM2.5 และรายละเอียดของวันนั้น</span>
          </div>
        )}
      </div>
    </section>
  );
}

