"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/card";
import { getAQIBgClass, getAQICategory, getAQITextClass } from "@/lib/aqi/calculate";
import { calculateRisk } from "@/lib/risk/calculate-risk";
import { type Province } from "@/lib/provinces";
import { type ProvinceAirQuality } from "@/lib/mock/air-quality";

type Props = {
  province: Province;
  current: ProvinceAirQuality;
  previousProvince?: Province;
  nextProvince?: Province;
};

const makeSeries = (base: number, points: number, label: string) => Array.from({ length: points }, (_, i) => ({
  name: `${label}${i + 1}`,
  value: Math.max(8, Math.round(base + Math.sin(i / 2) * 12 + ((i % 3) - 1) * 3)),
}));

export function ProvinceDetailPage({ province, current, previousProvince, nextProvince }: Props) {
  const category = getAQICategory(current.aqi);
  const pm25Trend = makeSeries(current.pm25, 24, "H");
  const aqiTrend = makeSeries(current.aqi, 24, "H");
  const forecast7d = makeSeries(current.pm25 * 0.95, 7, "D");
  const weather = { temp: 31, humidity: 64, windSpeed: 14, windDir: "NE", rain: 20, source: "demo-weather" };
  const risk = calculateRisk({ pm25: current.pm25, pm10: current.pm10, aqi: current.aqi, windSpeed: weather.windSpeed, humidity: weather.humidity, temperature: weather.temp, isStale: current.isStale });

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold">{province.thaiName}</h2>
            <p className="text-slate-500">{province.englishName} • {province.region}</p>
            <p className="text-xs text-slate-400">last updated: {new Date(current.updatedAt).toLocaleString("th-TH")}</p>
          </div>
          <div className="flex gap-2 text-xs">
            <span className="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800">source: {current.source}</span>
            <span className="rounded-full bg-violet-100 px-3 py-1 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">Demo</span>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">{current.isStale ? "Stale" : "Live"}</span>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Card>AQI <p className="text-2xl font-bold">{current.aqi}</p></Card>
        <Card>PM2.5 <p className="text-2xl font-bold">{current.pm25}</p></Card>
        <Card>PM10 <p className="text-2xl font-bold">{current.pm10}</p></Card>
        <Card>Risk Score <p className="text-2xl font-bold">{risk.riskScore}</p></Card>
        <Card>Confidence <p className="text-2xl font-bold">{risk.confidence}%</p></Card>
      </div>

      <Card>
        <h3 className="font-semibold">Risk analysis</h3>
        <div className="mt-3 space-y-2 text-sm">
          <p><span className={`rounded-full px-2 py-1 ${getAQIBgClass(current.aqi)} ${getAQITextClass(current.aqi)}`}>{risk.thaiLabel}</span></p>
          <p>คำอธิบาย: {risk.explanation}</p>
          <p>คำแนะนำสุขภาพ: {risk.recommendations.join(" • ")}</p>
          <p>กลุ่มเสี่ยง: {risk.sensitiveGroups.join(" • ")}</p>
          <p>กิจกรรมกลางแจ้ง: {risk.outdoorAdvice}</p>
        </div>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card><h3 className="mb-3 font-semibold">24-hour PM2.5 trend (demo)</h3><div className="h-64"><ResponsiveContainer width="100%" height="100%"><AreaChart data={pm25Trend}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip /><Area type="monotone" dataKey="value" stroke="#0ea5e9" fill="#bae6fd" /></AreaChart></ResponsiveContainer></div></Card>
        <Card><h3 className="mb-3 font-semibold">24-hour AQI trend (demo)</h3><div className="h-64"><ResponsiveContainer width="100%" height="100%"><LineChart data={aqiTrend}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip /><Line type="monotone" dataKey="value" stroke="#f97316" strokeWidth={2} /></LineChart></ResponsiveContainer></div></Card>
      </div>

      <Card><h3 className="mb-3 font-semibold">7-day forecast PM2.5 (demo)</h3><div className="h-64"><ResponsiveContainer width="100%" height="100%"><LineChart data={forecast7d}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip /><Line type="monotone" dataKey="value" stroke="#8b5cf6" strokeWidth={2} /></LineChart></ResponsiveContainer></div></Card>

      <Card>
        <h3 className="font-semibold">สภาพอากาศ (Mock)</h3>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
          <p>อุณหภูมิ: {weather.temp}°C</p><p>ความชื้น: {weather.humidity}%</p><p>ลม: {weather.windSpeed} km/h</p><p>ทิศลม: {weather.windDir}</p><p>ฝน: {weather.rain}%</p><p>source: {weather.source}</p>
        </div>
      </Card>

      <Card>
        <h3 className="font-semibold">Source transparency</h3>
        <ul className="mt-3 space-y-1 text-sm">
          <li>air quality source: {current.source}</li>
          <li>weather source: {weather.source}</li>
          <li>measuredAt: {new Date(current.updatedAt).toISOString()}</li>
          <li>fetchedAt: {new Date().toISOString()}</li>
          <li>isFallback: true (demo chain)</li>
          <li>isStale: {String(current.isStale)}</li>
          <li>confidence: {risk.confidence}%</li>
          <li>provider chain: Open-Meteo → WAQI → Air4Thai/PCD → OpenAQ → Cache/Demo</li>
        </ul>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Link href="/dashboard" className="rounded-xl border px-3 py-2 text-sm"><ArrowLeft className="mr-1 inline h-4 w-4" />Back to dashboard</Link>
        {previousProvince && <Link href={`/province/${previousProvince.id}`} className="rounded-xl border px-3 py-2 text-sm"><ArrowLeft className="mr-1 inline h-4 w-4" />{previousProvince.thaiName}</Link>}
        {nextProvince && <Link href={`/province/${nextProvince.id}`} className="rounded-xl border px-3 py-2 text-sm">{nextProvince.thaiName}<ArrowRight className="ml-1 inline h-4 w-4" /></Link>}
      </div>
    </div>
  );
}
