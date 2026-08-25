"use client";

import Link from "next/link";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowRight, TrendingUp } from "lucide-react";

export function Trend24hCard({ currentAqi = 68 }: { currentAqi?: number }) {
  // 24h diurnal pattern data
  const data = [
    { time: "00:00", aqi: Math.round(currentAqi * 0.75) },
    { time: "04:00", aqi: Math.round(currentAqi * 0.65) },
    { time: "08:00", aqi: Math.round(currentAqi * 0.95) },
    { time: "12:00", aqi: Math.round(currentAqi * 1.1) },
    { time: "16:00", aqi: Math.round(currentAqi * 1.25) },
    { time: "20:00", aqi: Math.round(currentAqi * 1.35) },
    { time: "24:00", aqi: Math.round(currentAqi * 0.85) },
  ];

  return (
    <div className="rounded-3xl border border-border bg-surface-1 p-6 shadow-medium flex flex-col justify-between">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-bold tracking-tight flex items-center gap-2">
            <TrendingUp size={18} className="text-brand" />
            แนวโน้ม 24 ชั่วโมง
          </h3>
          <p className="muted text-xs">การเปลี่ยนแปลงระดับคุณภาพอากาศในรอบวัน</p>
        </div>

        <Link
          href="/trends"
          className="group inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
        >
          ดูทั้งหมด
          <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f97316" stopOpacity={0.6} />
                <stop offset="95%" stopColor="#eab308" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="time" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} domain={[0, "auto"]} />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="rounded-xl border border-border bg-surface-1 p-2 text-xs shadow-md">
                      <span className="font-bold">{payload[0].payload.time}</span>
                      <span className="block text-brand font-extrabold">{payload[0].value} AQI</span>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Area
              type="monotone"
              dataKey="aqi"
              stroke="#f97316"
              strokeWidth={3}
              fillOpacity={1}
              fill="url(#trendGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
