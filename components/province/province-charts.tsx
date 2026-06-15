"use client";

import { useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendArea, type TrendPoint } from "@/components/charts/trend-area";
import { ForecastChart, type ForecastChartPoint } from "@/components/charts/forecast-chart";
import { MultiMetricChart, type MultiMetricPoint } from "@/components/charts/multi-metric-chart";
import { CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import type { TimePoint } from "@/services/types";
import type { DailyPoint } from "@/services/daily-summary.service";

export type DailySeriesPoint = { date: string; pm25: number | null };
export type HourlySeriesPoint = { t: string; pm25: number };
export type DailyForecastPoint = { t: string; pm25: number; confidence: number };

function dayLabel(iso: string) {
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}
function hourLabel(iso: string) {
  return new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit" });
}

const PM25_THRESHOLDS = [
  { y: 37.5, label: "เกณฑ์ไทย", color: "#f97316" },
  { y: 75, label: "อันตราย", color: "#ef4444" },
];

function Tabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: [T, string][];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-xl bg-surface-2 p-1 text-xs">
      {options.map(([key, label]) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`rounded-lg px-2.5 py-1 font-medium transition ${
            value === key ? "bg-brand text-white" : "muted hover:text-fg"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** Daily PM2.5 history with min/max confidence band. */
export function HistoryCard({ daily }: { daily: DailyPoint[] }) {
  const [range, setRange] = useState<"7" | "30" | "90">("30");
  const [metric, setMetric] = useState<"pm25" | "temp" | "wind">("pm25");
  const days = Number(range);
  const sliced = daily.slice(-days);

  if (metric === "temp") {
    const data: TrendPoint[] = sliced.map((d) => ({ label: dayLabel(d.date), value: d.temp }));
    return (
      <div className="card">
        <CardHeader
          title="แนวโน้มย้อนหลัง"
          description="ค่าเฉลี่ยรายวันจาก Supabase"
          action={
            <div className="flex flex-wrap gap-1">
              <Tabs value={metric} onChange={setMetric} options={[["pm25", "PM2.5"], ["temp", "อุณหภูมิ"], ["wind", "ลม"]]} />
              <Tabs value={range} onChange={setRange} options={[["7", "7 วัน"], ["30", "30 วัน"], ["90", "90 วัน"]]} />
            </div>
          }
        />
        <div className="card-pad">
          {data.length ? (
            <TrendArea data={data} color="#0d9488" unit="°C" />
          ) : (
            <EmptyState description="ยังไม่มีข้อมูลย้อนหลัง" />
          )}
        </div>
      </div>
    );
  }

  if (metric === "wind") {
    const data: TrendPoint[] = sliced.map((d) => ({ label: dayLabel(d.date), value: d.wind }));
    return (
      <div className="card">
        <CardHeader
          title="แนวโน้มย้อนหลัง"
          description="ค่าเฉลี่ยรายวันจาก Supabase"
          action={
            <div className="flex flex-wrap gap-1">
              <Tabs value={metric} onChange={setMetric} options={[["pm25", "PM2.5"], ["temp", "อุณหภูมิ"], ["wind", "ลม"]]} />
              <Tabs value={range} onChange={setRange} options={[["7", "7 วัน"], ["30", "30 วัน"], ["90", "90 วัน"]]} />
            </div>
          }
        />
        <div className="card-pad">
          {data.length ? (
            <TrendArea data={data} color="#06b6d4" unit="m/s" />
          ) : (
            <EmptyState description="ยังไม่มีข้อมูลย้อนหลัง" />
          )}
        </div>
      </div>
    );
  }

  // PM2.5 with min/max band
  const chartData = sliced.map((d) => ({
    label: dayLabel(d.date),
    mean: d.pm25,
    max: d.pm25Max,
    min: d.pm25Min,
    // For stacked band: base = min, band = max - min
    base: d.pm25Min ?? undefined,
    band:
      d.pm25Max != null && d.pm25Min != null ? +(d.pm25Max - d.pm25Min).toFixed(1) : undefined,
  }));

  return (
    <div className="card">
      <CardHeader
        title="แนวโน้มย้อนหลัง"
        description="ค่าเฉลี่ย / สูงสุด / ต่ำสุด PM2.5 รายวัน"
        action={
          <div className="flex flex-wrap gap-1">
            <Tabs value={metric} onChange={setMetric} options={[["pm25", "PM2.5"], ["temp", "อุณหภูมิ"], ["wind", "ลม"]]} />
            <Tabs value={range} onChange={setRange} options={[["7", "7 วัน"], ["30", "30 วัน"], ["90", "90 วัน"]]} />
          </div>
        }
      />
      <div className="card-pad">
        {chartData.length ? (
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
              <defs>
                <linearGradient id="pm25-band" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f97316" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#f97316" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(148 163 184 / 0.2)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="rgb(148 163 184 / 0.7)" minTickGap={24} />
              <YAxis tick={{ fontSize: 11 }} stroke="rgb(148 163 184 / 0.7)" width={40} />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid rgb(148 163 184 / 0.3)",
                  background: "rgb(var(--surface))",
                  color: "rgb(var(--fg))",
                  fontSize: 12,
                }}
                formatter={(v: number, name: string) => {
                  const labels: Record<string, string> = { mean: "เฉลี่ย", max: "สูงสุด", min: "ต่ำสุด", band: "ช่วง (สูงสุด-ต่ำสุด)" };
                  return [`${v} µg/m³`, labels[name] ?? name];
                }}
              />
              {PM25_THRESHOLDS.map((t) => (
                <ReferenceLine
                  key={t.label}
                  y={t.y}
                  stroke={t.color}
                  strokeDasharray="4 4"
                  label={{ value: t.label, fontSize: 10, fill: t.color, position: "right" }}
                />
              ))}
              {/* invisible base for band stacking */}
              <Area type="monotone" dataKey="base" stackId="band" stroke="none" fill="transparent" connectNulls name="ต่ำสุด" />
              <Area
                type="monotone"
                dataKey="band"
                stackId="band"
                stroke="none"
                fill="url(#pm25-band)"
                connectNulls
                name="ช่วง (สูงสุด-ต่ำสุด)"
              />
              <Area
                type="monotone"
                dataKey="mean"
                stroke="#f97316"
                strokeWidth={2}
                fill="none"
                connectNulls
                dot={false}
                name="เฉลี่ย"
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState description="ยังไม่มีข้อมูลย้อนหลัง" />
        )}
      </div>
      {sliced.length > 0 && (
        <div className="flex items-center gap-4 px-4 pb-3 text-xs muted">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-5 rounded" style={{ background: "#f97316" }} />
            เฉลี่ย
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3.5 w-5 rounded opacity-30" style={{ background: "#f97316" }} />
            ช่วง (Max–Min)
          </span>
        </div>
      )}
    </div>
  );
}

/** Hourly PM2.5 + AQI chart (72h from real Supabase hourly data). */
export function HourlyAirCard({ hourly }: { hourly: TimePoint[] }) {
  const [metric, setMetric] = useState<"pm25" | "aqi" | "pm10">("pm25");

  const data: MultiMetricPoint[] = hourly.map((h) => ({
    label: hourLabel(h.t),
    pm25: h.pm25,
    pm10: h.pm10 ?? null,
    aqi: h.aqi ?? null,
  }));

  const series: (keyof MultiMetricPoint)[] = [metric];

  return (
    <div className="card">
      <CardHeader
        title="ข้อมูลรายชั่วโมง"
        description={`ย้อนหลัง 72 ชม. · ${hourly.length} จุดข้อมูลจาก Supabase`}
        action={
          <Tabs
            value={metric}
            onChange={setMetric}
            options={[["pm25", "PM2.5"], ["pm10", "PM10"], ["aqi", "AQI"]]}
          />
        }
      />
      <div className="card-pad">
        {data.length ? (
          <MultiMetricChart
            data={data}
            series={series}
            showPm25Threshold={metric === "pm25"}
            height={240}
          />
        ) : (
          <EmptyState description="ยังไม่มีข้อมูลรายชั่วโมง" />
        )}
      </div>
    </div>
  );
}

/** Hourly weather chart — temperature · wind · humidity · pressure · precipitation. */
export function HourlyWeatherCard({ hourly }: { hourly: TimePoint[] }) {
  const [metric, setMetric] = useState<"temp-wind" | "humidity" | "pressure" | "precip">("temp-wind");

  const data: MultiMetricPoint[] = hourly.map((h) => ({
    label: hourLabel(h.t),
    temperature: h.temperature ?? null,
    humidity: h.humidity ?? null,
    windSpeed: h.windSpeed ?? null,
    pressure: h.pressure ?? null,
    precipitation: h.precipitation ?? null,
    visibility: h.visibility ?? null,
  }));

  const series: (keyof MultiMetricPoint)[] =
    metric === "temp-wind"
      ? ["temperature", "windSpeed"]
      : metric === "humidity"
      ? ["humidity"]
      : metric === "pressure"
      ? ["pressure"]
      : ["precipitation"];

  return (
    <div className="card">
      <CardHeader
        title="สภาพอากาศรายชั่วโมง"
        description={`อุณหภูมิ · ลม · ความชื้น · ความกดอากาศ · ฝน · ${hourly.length} จุดข้อมูล`}
        action={
          <Tabs
            value={metric}
            onChange={setMetric}
            options={[
              ["temp-wind", "อุณหภูมิ+ลม"],
              ["humidity", "ความชื้น"],
              ["pressure", "ความดัน"],
              ["precip", "ฝน"],
            ]}
          />
        }
      />
      <div className="card-pad">
        {data.length ? (
          <MultiMetricChart data={data} series={series} height={240} />
        ) : (
          <EmptyState description="ยังไม่มีข้อมูลสภาพอากาศรายชั่วโมง" />
        )}
      </div>
    </div>
  );
}

export function ForecastCard({
  hourly,
  daily,
}: {
  hourly: HourlySeriesPoint[];
  daily: DailyForecastPoint[];
}) {
  const [horizon, setHorizon] = useState<"24" | "72" | "7d">("72");

  let data: ForecastChartPoint[];
  if (horizon === "7d") {
    data = daily.map((d) => {
      const spread = d.pm25 * (1 - d.confidence);
      const lower = Math.max(0, d.pm25 - spread);
      return { label: dayLabel(d.t), pm25: d.pm25, base: lower, band: 2 * spread };
    });
  } else {
    const hours = Number(horizon);
    data = hourly.slice(0, hours).map((h) => ({ label: hourLabel(h.t), pm25: h.pm25 }));
  }

  return (
    <div className="card">
      <CardHeader
        title="พยากรณ์ PM2.5"
        description="ขอบฟ้าพยากรณ์สูงสุด 168 ชั่วโมง"
        action={
          <Tabs
            value={horizon}
            onChange={setHorizon}
            options={[
              ["24", "24 ชม."],
              ["72", "72 ชม."],
              ["7d", "7 วัน"],
            ]}
          />
        }
      />
      <div className="card-pad">
        {data.length ? <ForecastChart data={data} /> : <EmptyState description="ยังไม่มีพยากรณ์" />}
      </div>
    </div>
  );
}
