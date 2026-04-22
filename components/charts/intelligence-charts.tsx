"use client";

import { Line, LineChart, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, PolarGrid, PolarAngleAxis, BarChart, Bar, Cell } from "recharts";

export function TrendLineChart({ data }: { data: { day: string; pm25: number }[] }) {
  return (
    <div className="h-44 w-full">
      <ResponsiveContainer>
        <LineChart data={data}>
          <XAxis dataKey="day" stroke="currentColor" tick={{ fontSize: 11 }} />
          <YAxis stroke="currentColor" tick={{ fontSize: 11 }} />
          <Tooltip />
          <Line type="monotone" dataKey="pm25" stroke="#0ea5e9" strokeWidth={2.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ForecastLineChart({ data }: { data: { day: string; forecast: number }[] }) {
  return (
    <div className="h-44 w-full">
      <ResponsiveContainer>
        <LineChart data={data}>
          <XAxis dataKey="day" stroke="currentColor" tick={{ fontSize: 11 }} />
          <YAxis stroke="currentColor" tick={{ fontSize: 11 }} />
          <Tooltip />
          <Line type="natural" dataKey="forecast" stroke="#a855f7" strokeWidth={2.5} dot={{ r: 2 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RankingBars({ data }: { data: { name: string; value: number }[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 8 }}>
          <XAxis type="number" hide />
          <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Bar dataKey="value" radius={8}>
            {data.map((_, index) => (
              <Cell key={index} fill={index < 3 ? "#ef4444" : "#f59e0b"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RiskRadar({ value }: { value: { metric: string; score: number }[] }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <RadarChart data={value}>
          <PolarGrid />
          <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11 }} />
          <Tooltip />
          <Radar dataKey="score" stroke="#fb7185" fill="#fb7185" fillOpacity={0.35} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
