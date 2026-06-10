"use client";

import { useState } from "react";
import { TrendArea, type TrendPoint } from "@/components/charts/trend-area";
import { ForecastChart, type ForecastChartPoint } from "@/components/charts/forecast-chart";
import { CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";

export type DailySeriesPoint = { date: string; pm25: number | null };
export type HourlySeriesPoint = { t: string; pm25: number };
export type DailyForecastPoint = { t: string; pm25: number; confidence: number };

function dayLabel(iso: string) {
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}
function hourLabel(iso: string) {
  return new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit" });
}

const THRESHOLDS = [
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

export function HistoryCard({ daily }: { daily: DailySeriesPoint[] }) {
  const [range, setRange] = useState<"7" | "30" | "90">("30");
  const days = Number(range);
  const sliced = daily.slice(-days);
  const data: TrendPoint[] = sliced.map((d) => ({ label: dayLabel(d.date), value: d.pm25 }));

  return (
    <div className="card">
      <CardHeader
        title="แนวโน้มย้อนหลัง"
        description="ค่าเฉลี่ย PM2.5 รายวัน"
        action={
          <Tabs
            value={range}
            onChange={setRange}
            options={[
              ["7", "7 วัน"],
              ["30", "30 วัน"],
              ["90", "90 วัน"],
            ]}
          />
        }
      />
      <div className="card-pad">
        {data.length ? (
          <TrendArea data={data} thresholds={THRESHOLDS} />
        ) : (
          <EmptyState description="ยังไม่มีข้อมูลย้อนหลัง" />
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
