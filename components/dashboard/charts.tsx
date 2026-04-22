"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HistoricalPoint, ProvinceSnapshot } from "@/types/air";

export function HistoricalPmChart({ history }: { history: HistoricalPoint[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <LineChart data={history}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Line dataKey="pm25" stroke="#0284c7" strokeWidth={2} dot={false} />
          <Line dataKey="pm10" stroke="#64748b" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ProvinceRankingChart({ rows }: { rows: ProvinceSnapshot[] }) {
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer>
        <BarChart data={rows.slice(0, 15)}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="province_name_en" interval={0} angle={-20} height={70} textAnchor="end" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="air.pm25" fill="#ef4444" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ForecastTrendChart({ rows }: { rows: ProvinceSnapshot[] }) {
  const data = rows.slice(0, 12).map((r) => ({
    province: r.province_name_en,
    current: r.air.pm25,
    tomorrow: r.predicted_pm25,
  }));

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="province" interval={0} angle={-20} height={70} textAnchor="end" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line dataKey="current" stroke="#0ea5e9" strokeWidth={2} />
          <Line dataKey="tomorrow" stroke="#f97316" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RiskRadar({ item }: { item: ProvinceSnapshot }) {
  const data = [
    { subject: "PM2.5", value: Math.min(150, item.air.pm25) },
    { subject: "Humidity", value: item.weather.humidity },
    { subject: "Low Wind", value: Math.max(0, 20 - item.weather.wind) * 4 },
    { subject: "Hotspots", value: Math.min(150, item.hotspot_count * 10) },
    { subject: "Forecast", value: Math.min(150, item.predicted_pm25) },
  ];

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <RadarChart data={data}>
          <PolarGrid />
          <PolarAngleAxis dataKey="subject" />
          <Radar dataKey="value" stroke="#dc2626" fill="#f87171" fillOpacity={0.45} />
          <Tooltip />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
