"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ThailandHeatMap } from "@/components/dashboard/heatmap";
import { Card } from "@/components/ui/card";
import { cache } from "@/lib/cache";
import { buildThailandSnapshot } from "@/lib/engine";
import type { ProvinceSnapshot } from "@/types/air";

export default function MapPage() {
  const [rows, setRows] = useState<ProvinceSnapshot[]>([]);

  useEffect(() => {
    setRows(cache.getSnapshot());
    buildThailandSnapshot().then(setRows);
  }, []);

  const ranked = useMemo(() => [...rows].sort((a, b) => b.air.pm25 - a.air.pm25), [rows]);

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">Thailand Province Heat Map</h1>
      <Card>
        <ThailandHeatMap rows={ranked} />
      </Card>
      <Card>
        <h2 className="mb-2 font-semibold">Top 10 polluted now</h2>
        <ol className="space-y-2 text-sm">
          {ranked.slice(0, 10).map((row, i) => (
            <li key={row.slug} className="flex justify-between border-b pb-1">
              <Link href={`/province/${row.slug}`}>{i + 1}. {row.province_name_en}</Link>
              <span>{row.air.pm25} μg/m³</span>
            </li>
          ))}
        </ol>
      </Card>
    </section>
  );
}
