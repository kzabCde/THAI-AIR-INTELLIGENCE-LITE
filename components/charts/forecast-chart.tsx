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
  ErrorBar,
} from "recharts";
import type { ForecastDay } from "@/lib/ml-engine";

interface Props {
  history: { date: string; pm25: number }[];
  forecast: ForecastDay[];
  showBands?: boolean;
}

export function ForecastChart({ history, forecast, showBands = true }: Props) {
  const histData = history.map((h) => ({
    date: h.date.slice(5),
    actual: h.pm25,
    forecast: null,
    lower: null,
    upper: null,
  }));

  const forecastData = forecast.map((f) => ({
    date: f.date.slice(5),
    actual: null,
    forecast: f.predicted_pm25,
    lower: f.lower_bound,
    upper: f.upper_bound,
  }));

  const combined = [...histData, ...forecastData];

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={combined} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
          formatter={(v: unknown, name: string) => [typeof v === "number" ? v.toFixed(1) : "-", name === "actual" ? "ค่าจริง PM2.5" : "พยากรณ์ PM2.5"] as [string, string]}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <ReferenceLine x={histData.at(-1)?.date} stroke="#94a3b8" strokeDasharray="4 2" label={{ value: "วันนี้", fontSize: 10 }} />
        <ReferenceLine y={35.4} stroke="#f97316" strokeDasharray="5 3" label={{ value: "มาตรฐาน", fontSize: 10 }} />
        {showBands && (
          <Area
            type="monotone"
            dataKey="upper"
            name="ขอบบน"
            fill="#fca5a5"
            stroke="transparent"
            fillOpacity={0.25}
            dot={false}
            legendType="none"
          />
        )}
        {showBands && (
          <Area
            type="monotone"
            dataKey="lower"
            name="ขอบล่าง"
            fill="#fff"
            stroke="transparent"
            fillOpacity={1}
            dot={false}
            legendType="none"
          />
        )}
        <Line
          type="monotone"
          dataKey="actual"
          name="ค่าจริง PM2.5"
          stroke="#3b82f6"
          strokeWidth={2.5}
          dot={{ r: 3 }}
          activeDot={{ r: 5 }}
          connectNulls={false}
        />
        <Line
          type="monotone"
          dataKey="forecast"
          name="พยากรณ์ PM2.5"
          stroke="#ef4444"
          strokeWidth={2.5}
          strokeDasharray="6 3"
          dot={{ r: 3 }}
          activeDot={{ r: 5 }}
          connectNulls={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
