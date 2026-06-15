"use client";

import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type MultiMetricPoint = {
  label: string;
  pm25?: number | null;
  pm10?: number | null;
  aqi?: number | null;
  temperature?: number | null;
  humidity?: number | null;
  windSpeed?: number | null;
  pressure?: number | null;
  precipitation?: number | null;
  visibility?: number | null;
};

type Series = {
  key: keyof MultiMetricPoint;
  name: string;
  color: string;
  yAxisId: "left" | "right";
  unit?: string;
};

const SERIES_DEFS: Series[] = [
  { key: "pm25", name: "PM2.5", color: "#f97316", yAxisId: "left", unit: "µg/m³" },
  { key: "pm10", name: "PM10", color: "#ef4444", yAxisId: "left", unit: "µg/m³" },
  { key: "aqi", name: "AQI", color: "#a855f7", yAxisId: "left", unit: "" },
  { key: "temperature", name: "อุณหภูมิ", color: "#0d9488", yAxisId: "right", unit: "°C" },
  { key: "humidity", name: "ความชื้น", color: "#3b82f6", yAxisId: "right", unit: "%" },
  { key: "windSpeed", name: "ลม", color: "#06b6d4", yAxisId: "right", unit: "m/s" },
  { key: "pressure", name: "ความกดอากาศ", color: "#8b5cf6", yAxisId: "right", unit: "hPa" },
  { key: "precipitation", name: "ฝน", color: "#2563eb", yAxisId: "right", unit: "mm" },
  { key: "visibility", name: "ทัศนวิสัย", color: "#10b981", yAxisId: "right", unit: "km" },
];

export function MultiMetricChart({
  data,
  series,
  height = 280,
  showPm25Threshold = false,
}: {
  data: MultiMetricPoint[];
  series: (keyof MultiMetricPoint)[];
  height?: number;
  showPm25Threshold?: boolean;
}) {
  const activeSeries = SERIES_DEFS.filter((s) => series.includes(s.key));
  const hasLeft = activeSeries.some((s) => s.yAxisId === "left");
  const hasRight = activeSeries.some((s) => s.yAxisId === "right");

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: hasRight ? 4 : 12, bottom: 0, left: -12 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgb(148 163 184 / 0.2)" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="rgb(148 163 184 / 0.7)" minTickGap={28} />
        {hasLeft && (
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 11 }}
            stroke="rgb(148 163 184 / 0.7)"
            width={40}
          />
        )}
        {hasRight && (
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 11 }}
            stroke="rgb(148 163 184 / 0.7)"
            width={38}
          />
        )}
        <Tooltip
          contentStyle={{
            borderRadius: 12,
            border: "1px solid rgb(148 163 184 / 0.3)",
            background: "rgb(var(--surface))",
            color: "rgb(var(--fg))",
            fontSize: 12,
          }}
          formatter={(value: number, name: string) => {
            const s = SERIES_DEFS.find((d) => d.name === name);
            return [`${typeof value === "number" ? value.toFixed(1) : value}${s?.unit ? " " + s.unit : ""}`, name];
          }}
        />
        {showPm25Threshold && (
          <ReferenceLine
            yAxisId="left"
            y={37.5}
            stroke="#f97316"
            strokeDasharray="4 4"
            label={{ value: "เกณฑ์ไทย", fontSize: 10, fill: "#f97316", position: "right" }}
          />
        )}
        {activeSeries.map((s) => (
          <Line
            key={s.key}
            yAxisId={s.yAxisId}
            type="monotone"
            dataKey={s.key}
            name={s.name}
            stroke={s.color}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
