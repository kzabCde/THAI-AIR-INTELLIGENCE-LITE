"use client";

import { useMemo, useState } from "react";
import { ProvinceDrawer } from "@/components/panel/province-drawer";
import { ThailandMap } from "@/components/ThailandMap";
import { Card } from "@/components/ui/card";
import { useThailandSnapshot } from "@/lib/hooks/use-thailand-snapshot";

export default function MapPage() {
  const { data } = useThailandSnapshot();
  const rows = data?.data ?? [];
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [timelineIndex, setTimelineIndex] = useState(6);

  const ranked = useMemo(() => [...rows].sort((a, b) => b.air.pm25 - a.air.pm25), [rows]);
  const selectedRow = ranked.find((x) => x.slug === selected) ?? null;
  const timeline = Array.from({ length: 7 }).map((_, i) => Math.max(5, (selectedRow?.air.pm25 ?? 20) - (6 - i) * 2));

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-2xl font-bold">แผนที่ความร้อน PM2.5 ประเทศไทย</h1>
        <input className="rounded-xl border px-3 py-2 text-sm" placeholder="ค้นหาจังหวัดเพื่อโฟกัส" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button onClick={() => document.documentElement.requestFullscreen?.()} className="rounded-xl border px-3 py-2 text-sm">เต็มจอ</button>
      </div>

      <Card>
        <ThailandMap rows={ranked.map((x) => ({ ...x, air: { ...x.air, pm25: Math.max(1, x.air.pm25 - (6 - timelineIndex) * 1.2) } }))} search={search} selectedSlug={selected} pmDeltaByProvince={{}} onSelect={setSelected} />
      </Card>

      <Card>
        <p className="mb-2 text-sm font-medium">ไทม์ไลน์ย้อนหลัง (7 วัน)</p>
        <input type="range" min={0} max={6} value={timelineIndex} onChange={(e) => setTimelineIndex(Number(e.target.value))} className="w-full" />
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">พื้นที่เสี่ยงสูง (Pulse)</h2>
        <ol className="space-y-2 text-sm">
          {ranked.slice(0, 10).map((row, i) => (
            <li key={row.slug} className="flex justify-between border-b pb-1">
              <button onClick={() => setSelected(row.slug)} className="text-left hover:underline">{i + 1}. {row.province_name_th}</button>
              <span>{row.air.pm25.toFixed(1)} μg/m³</span>
            </li>
          ))}
        </ol>
      </Card>

      <ProvinceDrawer selected={selectedRow} timeline={timeline} onClose={() => setSelected(null)} onCompare={() => undefined} />
    </section>
  );
}
