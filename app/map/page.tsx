"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { fetchThaiAirData } from "@/lib/air";
import type { ProvinceAir } from "@/types/air";

const COLOR_STEPS = [
  { upTo: 12, color: "bg-emerald-500", label: "Good" },
  { upTo: 35.4, color: "bg-yellow-500", label: "Moderate" },
  { upTo: 55.4, color: "bg-orange-500", label: "Sensitive" },
  { upTo: 150.4, color: "bg-red-500", label: "Unhealthy" },
  { upTo: Infinity, color: "bg-fuchsia-600", label: "Very Unhealthy" },
];

const POSITIONS: Record<string, string> = {
  "chiang-rai": "left-[46%] top-[12%]",
  "chiang-mai": "left-[44%] top-[18%]",
  "udon-thani": "left-[58%] top-[26%]",
  "khon-kaen": "left-[56%] top-[36%]",
  "nakhon-ratchasima": "left-[52%] top-[46%]",
  "bangkok": "left-[45%] top-[56%]",
  "chonburi": "left-[50%] top-[58%]",
  "surat-thani": "left-[42%] top-[72%]",
  "songkhla": "left-[45%] top-[88%]",
  "phuket": "left-[34%] top-[79%]",
};

export default function MapPage() {
  const [data, setData] = useState<ProvinceAir[]>([]);

  useEffect(() => {
    fetchThaiAirData().then(setData);
  }, []);

  const ranked = useMemo(() => [...data].sort((a, b) => b.pm25 - a.pm25), [data]);

  const getStep = (value: number) => COLOR_STEPS.find((step) => value <= step.upTo) ?? COLOR_STEPS[COLOR_STEPS.length - 1];

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">Thailand PM2.5 Map View</h1>
      <Card>
        <div className="relative mx-auto h-[520px] max-w-md rounded-2xl bg-gradient-to-b from-sky-100 to-slate-100 p-4 dark:from-slate-900 dark:to-slate-800">
          {data.map((point) => {
            const step = getStep(point.pm25);
            return (
              <Link
                key={point.slug}
                href={`/province/${point.slug}`}
                className={`absolute ${POSITIONS[point.slug] ?? "left-[50%] top-[50%]"} -translate-x-1/2 -translate-y-1/2`}
              >
                <div className="group flex flex-col items-center gap-1">
                  <span className={`h-3.5 w-3.5 rounded-full ${step.color} ring-4 ring-white/70 dark:ring-slate-950/80`} />
                  <span className="rounded-md bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 shadow dark:bg-slate-900/90 dark:text-slate-100">
                    {point.province}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">Legend</h2>
        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-5">
          {COLOR_STEPS.map((step) => (
            <div key={step.label} className="flex items-center gap-2 text-sm">
              <span className={`h-3 w-3 rounded-full ${step.color}`} /> {step.label}
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">Highest PM2.5 now</h2>
        <ol className="space-y-2 text-sm">
          {ranked.slice(0, 5).map((r, i) => (
            <li key={r.slug} className="flex items-center justify-between border-b border-slate-200 pb-2 dark:border-slate-700">
              <span>{i + 1}. {r.province}</span>
              <span className="font-semibold">{r.pm25} μg/m³</span>
            </li>
          ))}
        </ol>
      </Card>
    </section>
  );
}
