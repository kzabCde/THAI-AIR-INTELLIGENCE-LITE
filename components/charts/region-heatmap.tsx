"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { pm25Color } from "@/lib/colors";

interface RegionData {
  region: string;
  avg_pm25: number;
  max_pm25: number;
  province_count: number;
}

export function RegionHeatmap({ data }: { data: RegionData[] }) {
  const sorted = [...data].sort((a, b) => b.avg_pm25 - a.avg_pm25);

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={sorted} layout="vertical" margin={{ top: 5, right: 32, left: 64, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11 }} domain={[0, "auto"]} />
        <YAxis type="category" dataKey="region" tick={{ fontSize: 12 }} width={60} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
          formatter={(v: number, name: string) => [`${v.toFixed(1)} μg/m³`, "PM2.5 เฉลี่ย"]}
        />
        <Bar dataKey="avg_pm25" name="PM2.5 เฉลี่ย" radius={[0, 4, 4, 0]}>
          {sorted.map((entry) => (
            <Cell key={entry.region} fill={pm25Color(entry.avg_pm25)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
