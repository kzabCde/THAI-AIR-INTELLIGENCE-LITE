"use client";

import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { HistoricalPoint } from "@/types/air";

interface Props {
  history: HistoricalPoint[];
  metric?: "pm25" | "pm10" | "aqi" | "temp" | "humidity" | "wind";
}

const METRIC_CONFIG = {
  pm25: { label: "PM2.5 (μg/m³)", color: "#ef4444", safeLimit: 35.4 },
  pm10: { label: "PM10 (μg/m³)", color: "#f97316", safeLimit: 50 },
  aqi: { label: "AQI", color: "#8b5cf6", safeLimit: 100 },
  temp: { label: "อุณหภูมิ (°C)", color: "#06b6d4", safeLimit: undefined },
  humidity: { label: "ความชื้น (%)", color: "#3b82f6", safeLimit: undefined },
  wind: { label: "ความเร็วลม (m/s)", color: "#10b981", safeLimit: undefined },
};

export function HistoricalChart({ history, metric = "pm25" }: Props) {
  const cfg = METRIC_CONFIG[metric];
  const data = history.map((h) => ({
    date: h.date.slice(5),
    value: h[metric] as number,
    hotspots: h.hotspots,
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
          formatter={(v: number) => [v.toFixed(1), cfg.label]}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Area
          type="monotone"
          dataKey="value"
          name={cfg.label}
          fill={cfg.color}
          stroke={cfg.color}
          fillOpacity={0.15}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
        {cfg.safeLimit && (
          <ReferenceLine y={cfg.safeLimit} stroke="#64748b" strokeDasharray="5 3" label={{ value: `มาตรฐาน ${cfg.safeLimit}`, fontSize: 10 }} />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
