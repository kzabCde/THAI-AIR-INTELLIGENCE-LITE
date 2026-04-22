"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { fetchThaiAirData, toAqi } from "@/lib/air";
import { storage } from "@/lib/storage";
import type { ProvinceAir } from "@/types/air";

export default function ComparePage() {
  const [data, setData] = useState<ProvinceAir[]>([]);
  const [a, setA] = useState("");
  const [b, setB] = useState("");

  useEffect(() => {
    fetchThaiAirData().then((items) => {
      setData(items);
      const saved = storage.getCompare();
      setA(saved[0] ?? items[0]?.slug ?? "");
      setB(saved[1] ?? items[1]?.slug ?? "");
    });
  }, []);

  useEffect(() => {
    if (a && b) storage.setCompare([a, b]);
  }, [a, b]);

  const left = useMemo(() => data.find((p) => p.slug === a), [data, a]);
  const right = useMemo(() => data.find((p) => p.slug === b), [data, b]);

  const select = (value: string, setter: (v: string) => void) => (
    <select value={value} onChange={(e) => setter(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-transparent p-2">
      {data.map((p) => <option key={p.slug} value={p.slug}>{p.province}</option>)}
    </select>
  );

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">Compare Provinces</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>{select(a, setA)}</Card>
        <Card>{select(b, setB)}</Card>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {[left, right].map((item, idx) => (
          <Card key={idx}>
            {item ? (
              <>
                <h2 className="text-lg font-semibold">{item.province}</h2>
                <p>PM2.5: <b>{item.pm25}</b> μg/m³</p>
                <p>AQI estimate: <b>{toAqi(item.pm25)}</b></p>
              </>
            ) : (
              <p>Select province</p>
            )}
          </Card>
        ))}
      </div>
    </section>
  );
}
