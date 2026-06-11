"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type TrendPoint = { label: string; value: number | null };

export function TrendArea({
  data,
  color = "#0d9488",
  unit = "µg/m³",
  thresholds = [],
  height = 240,
}: {
  data: TrendPoint[];
  color?: string;
  unit?: string;
  thresholds?: { y: number; label: string; color: string }[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
        <defs>
          <linearGradient id={`grad-${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
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
          formatter={(v: number) => [`${v} ${unit}`, "PM2.5"]}
        />
        {thresholds.map((t) => (
          <ReferenceLine
            key={t.label}
            y={t.y}
            stroke={t.color}
            strokeDasharray="4 4"
            label={{ value: t.label, fontSize: 10, fill: t.color, position: "right" }}
          />
        ))}
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          fill={`url(#grad-${color})`}
          connectNulls
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
