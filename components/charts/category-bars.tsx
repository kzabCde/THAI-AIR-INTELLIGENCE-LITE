"use client";

import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { bandForPm25 } from "@/lib/aqi";

export type CategoryBar = { label: string; value: number };

export function CategoryBars({
  data,
  height = 240,
  colorByAqi = true,
  color = "#0d9488",
}: {
  data: CategoryBar[];
  height?: number;
  colorByAqi?: boolean;
  color?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgb(148 163 184 / 0.2)" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="rgb(148 163 184 / 0.7)" />
        <YAxis tick={{ fontSize: 11 }} stroke="rgb(148 163 184 / 0.7)" width={40} />
        <Tooltip
          cursor={{ fill: "rgb(148 163 184 / 0.1)" }}
          contentStyle={{
            borderRadius: 12,
            border: "1px solid rgb(148 163 184 / 0.3)",
            background: "rgb(var(--surface))",
            color: "rgb(var(--fg))",
            fontSize: 12,
          }}
        />
        <Bar dataKey="value" radius={[6, 6, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={colorByAqi ? bandForPm25(d.value).color : color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
