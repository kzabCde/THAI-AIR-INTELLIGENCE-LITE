"use client";

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

export type ForecastChartPoint = {
  label: string;
  pm25: number;
  band?: number; // upper confidence offset (rendered as stacked area)
  base?: number; // lower bound of confidence area
};

export function ForecastChart({
  data,
  height = 280,
  color = "#0d9488",
}: {
  data: ForecastChartPoint[];
  height?: number;
  color?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgb(148 163 184 / 0.2)" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="rgb(148 163 184 / 0.7)" minTickGap={28} />
        <YAxis tick={{ fontSize: 11 }} stroke="rgb(148 163 184 / 0.7)" width={40} />
        <Tooltip
          contentStyle={{
            borderRadius: 12,
            border: "1px solid rgb(148 163 184 / 0.3)",
            background: "rgb(var(--surface))",
            color: "rgb(var(--fg))",
            fontSize: 12,
          }}
        />
        <ReferenceLine y={37.5} stroke="#f97316" strokeDasharray="4 4" label={{ value: "เกณฑ์ไทย", fontSize: 10, fill: "#f97316", position: "right" }} />
        {/* Confidence band: invisible base + translucent band stacked on top. */}
        <Area type="monotone" dataKey="base" stackId="c" stroke="none" fill="transparent" connectNulls />
        <Area type="monotone" dataKey="band" stackId="c" stroke="none" fill={color} fillOpacity={0.14} connectNulls name="ช่วงความเชื่อมั่น" />
        <Line type="monotone" dataKey="pm25" stroke={color} strokeWidth={2.5} dot={false} name="PM2.5 พยากรณ์" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
