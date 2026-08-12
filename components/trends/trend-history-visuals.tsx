"use client";

import { Activity, CalendarDays, Info } from "lucide-react";
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
  formatTrendRange,
  parseDateKey,
  PM25_LEGEND,
} from "./trend-format";

const WEEKDAY_LABELS = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];

export function HistoricalChart({ analysis }: { analysis: TrendAnalysis }) {
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
            <h2 className="text-sm font-black text-fg sm:text-base">เส้นเวลาฝุ่น PM2.5</h2>
          </div>
          <p className="mt-1 text-xs text-muted">
            ค่าเฉลี่ยรายวัน ช่วงต่ำสุด–สูงสุด และค่าเฉลี่ยเคลื่อนที่เมื่อมีข้อมูลครบ 7/7 วัน
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[10px] font-semibold text-muted sm:text-xs">
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-orange-500" />รายวัน</span>
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-emerald-500" />เฉลี่ย 7 วัน</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-4 rounded bg-orange-200/70" />ต่ำสุด–สูงสุด</span>
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
                        <p>เฉลี่ย <strong className="text-fg">{fmtPm25(point.pm25)} µg/m³</strong></p>
                        <p>ต่ำสุด–สูงสุด {fmtPm25(point.pm25Min)}–{fmtPm25(point.pm25Max)} µg/m³</p>
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
        <p>ช่องว่างคือวันที่ไม่มีข้อมูลที่ผ่านเกณฑ์อย่างน้อย 18 ชั่วโมง ระบบไม่ลากเส้นเชื่อมข้ามวันที่ข้อมูลหาย</p>
      </div>
    </section>
  );
}

export function CalendarHeatmap({ analysis }: { analysis: TrendAnalysis }) {
  if (!analysis.calendar.length) return null;

  const firstWeekday = (parseDateKey(analysis.calendar[0].date).getUTCDay() + 6) % 7;
  const cells: Array<TrendCalendarPoint | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...analysis.calendar,
  ];

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarDays size={16} className="text-emerald-600" />
          <h2 className="text-sm font-black text-fg">ปฏิทินคุณภาพอากาศ</h2>
        </div>
        <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[10px] font-bold text-muted">
          {formatTrendRange(analysis.fromDate, analysis.anchorDate)}
        </span>
      </div>

      <div className="mt-4 flex gap-2">
        <div className="grid shrink-0 grid-rows-7 gap-1 text-[9px] font-bold text-muted">
          {WEEKDAY_LABELS.map((day) => <span key={day} className="flex h-3 w-5 items-center">{day}</span>)}
        </div>
        <div className="no-scrollbar overflow-x-auto pb-2">
          <div className="grid w-max grid-flow-col grid-rows-7 gap-1">
            {cells.map((point, index) => {
              if (!point) return <span key={`blank-${index}`} className="h-3 w-3" />;
              const band = point.pm25 == null ? null : bandForPm25(point.pm25);
              const title = point.pm25 == null
                ? `${formatTrendDate(point.date, true)}: ไม่มีข้อมูล`
                : `${formatTrendDate(point.date, true)}: ${fmtPm25(point.pm25)} µg/m³ · ${point.hoursAvailable ?? 0}/24 ชม.`;
              return (
                <span
                  key={point.date}
                  className={`h-3 w-3 rounded-[3px] border ${point.hoursAvailable != null && point.hoursAvailable < 24 ? "border-slate-600/50" : "border-transparent"}`}
                  style={{ backgroundColor: band?.color ?? "rgb(203 213 225 / 0.55)" }}
                  title={title}
                  aria-label={title}
                />
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[10px] font-semibold text-muted">
        {AQI_BANDS.map((band, index) => (
          <span key={band.level} className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: band.color }} />
            {band.labelTh} {PM25_LEGEND[index]}
          </span>
        ))}
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-[3px] bg-slate-300" />ไม่มีข้อมูล</span>
      </div>
    </section>
  );
}
