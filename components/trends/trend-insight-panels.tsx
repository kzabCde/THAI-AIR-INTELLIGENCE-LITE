"use client";

import { useState, type ReactNode } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Database,
  Droplets,
  Flame,
  Gauge,
  Info,
  ShieldCheck,
  ThermometerSun,
  Wind,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { bandForPm25 } from "@/lib/aqi";
import { fmtPm25 } from "@/lib/format";
import {
  THAI_PM25_STANDARD,
  type TrendAnalysis,
  type TrendEpisode,
} from "@/lib/trends-insights";
import {
  formatTrendDate,
  formatTrendMonth,
  signedTrendValue,
} from "./trend-format";

type DriverKey = "wind" | "humidity" | "temp";

const DRIVER_META: Record<
  DriverKey,
  { label: string; unit: string; color: string; icon: ReactNode }
> = {
  wind: { label: "ความเร็วลม", unit: "m/s", color: "#0891b2", icon: <Wind size={14} /> },
  humidity: { label: "ความชื้น", unit: "%", color: "#3b82f6", icon: <Droplets size={14} /> },
  temp: { label: "อุณหภูมิ", unit: "°C", color: "#eab308", icon: <ThermometerSun size={14} /> },
};

export function DriverChart({ analysis }: { analysis: TrendAnalysis }) {
  const [driver, setDriver] = useState<DriverKey>("wind");
  const meta = DRIVER_META[driver];
  const data = analysis.calendar.map((point) => ({
    date: point.date,
    label: formatTrendDate(point.date),
    pm25: point.pm25,
    driver:
      driver === "wind"
        ? point.wind
        : driver === "humidity"
          ? point.humidity
          : point.temp,
  }));

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      <div>
        <div className="flex items-center gap-2">
          <Gauge size={16} className="text-cyan-600" />
          <h2 className="text-sm font-black text-fg">ปัจจัยสภาพอากาศร่วมกับฝุ่น</h2>
        </div>
        <p className="mt-1 text-xs text-muted">
          เปรียบเทียบค่า PM2.5 กับสภาพอากาศในวันเดียวกัน (ความเร็วลม / ความชื้น / อุณหภูมิ)
        </p>
      </div>

      <div className="no-scrollbar mt-3 flex gap-1 overflow-x-auto rounded-full bg-surface-2 p-1">
        {(Object.keys(DRIVER_META) as DriverKey[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setDriver(key)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold transition ${
              driver === key ? "bg-emerald-600 text-white shadow-sm" : "text-muted hover:text-fg"
            }`}
          >
            {DRIVER_META[key].icon}
            {DRIVER_META[key].label}
          </button>
        ))}
      </div>

      <div className="mt-3 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: -8, bottom: 0, left: -22 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgb(148 163 184 / 0.18)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
              minTickGap={38}
            />
            <YAxis yAxisId="pm" tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false} width={38} />
            <YAxis
              yAxisId="driver"
              orientation="right"
              tick={{ fontSize: 9, fill: meta.color }}
              axisLine={false}
              tickLine={false}
              width={36}
            />
            <Tooltip
              contentStyle={{ borderRadius: 12, border: "1px solid rgb(226 232 240)", fontSize: 11 }}
              labelFormatter={(_, payload) =>
                payload?.[0]?.payload?.date ? formatTrendDate(payload[0].payload.date, true) : ""
              }
              formatter={(value: number, name: string) => [
                `${Number(value).toFixed(1)} ${name === "PM2.5" ? "µg/m³" : meta.unit}`,
                name,
              ]}
            />
            <ReferenceLine yAxisId="pm" y={THAI_PM25_STANDARD} stroke="#f97316" strokeDasharray="4 4" />
            <Line
              yAxisId="pm"
              type="monotone"
              dataKey="pm25"
              name="PM2.5"
              stroke="#334155"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Line
              yAxisId="driver"
              type="monotone"
              dataKey="driver"
              name={meta.label}
              stroke={meta.color}
              strokeWidth={1.8}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2.5 rounded-xl border border-cyan-100 bg-cyan-50/60 p-2.5 text-[11px] text-cyan-900 dark:border-cyan-900/40 dark:bg-cyan-950/30 dark:text-cyan-200">
        💡 <strong>ข้อสังเกต:</strong> เมื่อความเร็วลมต่ำ ลมสงบ หรือความชื้นสูง
        ฝุ่นมักจะเกิดการสะสมตัวได้ง่ายขึ้นเนื่องจากสภาพอากาศปิด
      </div>
    </section>
  );
}


function EpisodeRow({ episode, index }: { episode: TrendEpisode; index: number }) {
  const band = bandForPm25(episode.peakPm25);
  return (
    <div className="rounded-xl border border-border bg-surface-2/60 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black text-white" style={{ backgroundColor: band.color }}>
            {index + 1}
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-black text-fg">
              {episode.startDate === episode.endDate
                ? formatTrendDate(episode.startDate, true)
                : `${formatTrendDate(episode.startDate)} – ${formatTrendDate(episode.endDate, true)}`}
            </p>
            <p className="mt-0.5 text-[10px] font-medium text-muted">
              {episode.days} วัน · เฉลี่ย {fmtPm25(episode.averagePm25)} µg/m³
            </p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-black tabular-nums" style={{ color: band.color }}>{fmtPm25(episode.peakPm25)}</p>
          <p className="text-[9px] font-bold text-muted">สูงสุด µg/m³</p>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 border-t border-border pt-2 text-center">
        <div><p className="text-xs font-black tabular-nums text-fg">{episode.averageWind == null ? "-" : episode.averageWind.toFixed(1)}</p><p className="text-[9px] text-muted">ลมเฉลี่ย m/s</p></div>
        <div><p className="text-xs font-black tabular-nums text-fg">{episode.averageHumidity == null ? "-" : episode.averageHumidity.toFixed(0)}</p><p className="text-[9px] text-muted">ความชื้นเฉลี่ย %</p></div>
      </div>
    </div>
  );
}

export function EpisodesCard({ analysis }: { analysis: TrendAnalysis }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Flame size={16} className="text-orange-600" />
            <h2 className="text-sm font-black text-fg">ช่วงฝุ่นสูงที่สำคัญ</h2>
          </div>
          <p className="mt-1 text-xs text-muted">วันที่สูงกว่าเกณฑ์อ้างอิง 37.5 µg/m³ ต่อเนื่องกัน</p>
        </div>
        <span className="rounded-full bg-orange-100 px-2.5 py-1 text-[10px] font-black text-orange-700 dark:bg-orange-950/50 dark:text-orange-300">
          {analysis.episodes.length} ช่วง
        </span>
      </div>
      <div className="mt-3 space-y-2">
        {analysis.episodes.length ? (
          analysis.episodes.slice(0, 3).map((episode, index) => (
            <EpisodeRow key={`${episode.startDate}-${episode.endDate}`} episode={episode} index={index} />
          ))
        ) : (
          <div className="flex items-start gap-3 rounded-xl bg-emerald-50 p-4 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
            <CheckCircle2 size={20} className="shrink-0" />
            <div><p className="text-sm font-black">ไม่พบช่วงฝุ่นสูงต่อเนื่อง</p><p className="mt-1 text-xs opacity-80">วันที่มีข้อมูลทั้งหมดไม่สูงกว่าเกณฑ์อ้างอิง</p></div>
          </div>
        )}
      </div>
    </section>
  );
}

export function MonthlyPattern({ analysis }: { analysis: TrendAnalysis }) {
  const data = analysis.months.map((month) => ({ ...month, label: formatTrendMonth(month.month) }));
  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      <div className="flex items-center gap-2">
        <CalendarDays size={16} className="text-violet-600" />
        <h2 className="text-sm font-black text-fg">รูปแบบรายเดือน</h2>
      </div>
      <p className="mt-1 text-xs text-muted">12 เดือนปฏิทินล่าสุด เดือนปัจจุบันนับถึงวันที่สิ้นสุดการวิเคราะห์</p>
      <div className="mt-3 h-60">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -22 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgb(148 163 184 / 0.18)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false} width={38} />
            <Tooltip
              cursor={{ fill: "rgb(148 163 184 / 0.08)" }}
              content={({ active, payload }) => {
                const month = payload?.[0]?.payload as (typeof data)[number] | undefined;
                if (!active || !month) return null;
                return (
                  <div className="rounded-xl border border-border bg-surface/95 p-3 text-xs shadow-soft backdrop-blur">
                    <p className="font-black text-fg">{month.label}</p>
                    <div className="mt-1 space-y-1 text-muted">
                      <p>เฉลี่ย {fmtPm25(month.averagePm25)} µg/m³</p>
                      <p>สูงกว่าเกณฑ์ {month.exceedanceDays} วัน</p>
                      <p>มีข้อมูล {month.observedDays}/{month.expectedDays} วัน</p>
                      {month.yearOverYearPercent != null && <p>เทียบช่วงวันเดียวกันปีก่อน {signedTrendValue(month.yearOverYearPercent, "%")}</p>}
                    </div>
                  </div>
                );
              }}
            />
            <ReferenceLine y={THAI_PM25_STANDARD} stroke="#f97316" strokeDasharray="4 4" />
            <Bar dataKey="averagePm25" radius={[6, 6, 0, 0]} maxBarSize={34} isAnimationActive={false}>
              {data.map((month) => (
                <Cell key={month.month} fill={month.averagePm25 == null ? "#cbd5e1" : bandForPm25(month.averagePm25).color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export function BurningComparison({ analysis }: { analysis: TrendAnalysis }) {
  const burningAvg = analysis.burning.averagePm25;
  const nonBurningAvg = analysis.nonBurning.averagePm25;
  const comparable = analysis.burning.coveragePercent >= 80 && analysis.nonBurning.coveragePercent >= 80;
  const delta = comparable && burningAvg != null && nonBurningAvg != null ? burningAvg - nonBurningAvg : null;

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      <div className="flex items-center gap-2">
        <Flame size={16} className="text-orange-600" />
        <h2 className="text-sm font-black text-fg">ช่วงเผาเทียบช่วงอื่น</h2>
      </div>
      <p className="mt-1 text-xs text-muted">ม.ค.–เม.ย. ตามฟิลด์ is_burning_season ในฐานข้อมูล</p>
      <div className="mt-4 space-y-3">
        {[
          { label: "ช่วงเผา", stats: analysis.burning, icon: <Flame size={15} />, color: "#f97316", box: "bg-orange-50 dark:bg-orange-950/30" },
          { label: "นอกช่วงเผา", stats: analysis.nonBurning, icon: <ShieldCheck size={15} />, color: "#10b981", box: "bg-emerald-50 dark:bg-emerald-950/30" },
        ].map((item) => (
          <div key={item.label} className={`flex items-center justify-between rounded-xl p-3 ${item.box}`}>
            <div className="flex items-center gap-2" style={{ color: item.color }}>{item.icon}<span className="text-xs font-black">{item.label}</span></div>
            <div className="text-right">
              <p className="text-xl font-black tabular-nums text-fg">{fmtPm25(item.stats.averagePm25)} <span className="text-[10px] text-muted">µg/m³</span></p>
              <p className="text-[9px] text-muted">{item.stats.observedDays}/{item.stats.expectedDays} วัน</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-xl bg-surface-2 p-3 text-xs text-muted">
        {delta == null ? "จะแสดงผลเปรียบเทียบเมื่อทั้งสองช่วงมีข้อมูลอย่างน้อย 80%" : (
          <>ช่วงเผามีค่าเฉลี่ย <strong className={delta > 0 ? "text-orange-600" : "text-emerald-600"}>{Math.abs(delta).toFixed(1)} µg/m³</strong> {delta > 0 ? "สูงกว่า" : "ต่ำกว่า"}ช่วงอื่น</>
        )}
      </div>
    </section>
  );
}

export function DataQualityCard({ analysis, isRegional = false }: { analysis: TrendAnalysis; isRegional?: boolean }) {
  const openMeteo = analysis.sources.some((source) => source.toLowerCase().includes("open-meteo"));
  return (
    <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900 dark:bg-emerald-950/20 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="rounded-full bg-emerald-100 p-2 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"><Database size={17} /></span>
          <div>
            <h2 className="text-sm font-black text-fg">ความน่าเชื่อถือของข้อมูล</h2>
            <p className="mt-1 text-xs text-muted">ใช้เฉพาะข้อมูลที่ไม่ถูกระบุเป็น synthetic, mock หรือ demo</p>
          </div>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black text-emerald-700 shadow-sm dark:bg-slate-900 dark:text-emerald-300">
          ครบ {analysis.current.coveragePercent}% ของวัน
        </span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-white/80 p-3 dark:bg-slate-900/70"><p className="text-[10px] font-bold text-muted">ข้อมูลรายวัน</p><p className="mt-1 text-sm font-black text-fg">{analysis.current.observedDays}/{analysis.current.expectedDays} วัน</p></div>
        <div className="rounded-xl bg-white/80 p-3 dark:bg-slate-900/70"><p className="text-[10px] font-bold text-muted">ครอบคลุมรายชั่วโมง</p><p className="mt-1 text-sm font-black text-fg">{analysis.hourlyCoveragePercent}%</p></div>
        <div className="rounded-xl bg-white/80 p-3 dark:bg-slate-900/70"><p className="text-[10px] font-bold text-muted">วันข้อมูลล่าสุด</p><p className="mt-1 text-sm font-black text-fg">{formatTrendDate(analysis.latestDataDate, true)}</p></div>
        <div className="rounded-xl bg-white/80 p-3 dark:bg-slate-900/70"><p className="text-[10px] font-bold text-muted">แหล่งข้อมูลในช่วงนี้</p><p className="mt-1 truncate text-sm font-black text-fg" title={analysis.sources.join(", ")}>{analysis.sources.length ? analysis.sources.join(", ") : "ไม่ระบุ"}</p></div>
      </div>
      {openMeteo && (
        <p className="mt-3 flex items-start gap-2 text-[11px] text-muted"><Info size={13} className="mt-0.5 shrink-0" />ข้อมูลคุณภาพอากาศย้อนหลังจาก Open-Meteo อ้างอิงแบบจำลอง CAMS ไม่ใช่ค่าตรวจวัดจากสถานีภาคพื้นดินโดยตรง</p>
      )}
    </section>
  );
}
