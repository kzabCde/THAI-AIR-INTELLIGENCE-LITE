"use client";

import { useMemo, useState } from "react";

type District = { province: string; district: string; lat: number; lon: number };

export function DistrictSelector({ districts, onSelect }: { districts: District[]; onSelect: (district: District) => void }) {
  const [province, setProvince] = useState("");
  const [search, setSearch] = useState("");

  const provinces = useMemo(() => Array.from(new Set(districts.map((d) => d.province))), [districts]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return districts.filter((d) => (!province || d.province === province) && (!q || d.district.toLowerCase().includes(q)));
  }, [districts, province, search]);

  return (
    <div className="grid gap-2 md:grid-cols-3">
      <select className="rounded border p-2" value={province} onChange={(e) => setProvince(e.target.value)}>
        <option value="">ทุกจังหวัด</option>
        {provinces.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      <input className="rounded border p-2" placeholder="ค้นหาอำเภอ" value={search} onChange={(e) => setSearch(e.target.value)} />
      <select className="rounded border p-2" onChange={(e) => {
        const item = filtered[Number(e.target.value)];
        if (item) onSelect(item);
      }}>
        <option>เลือกอำเภอ</option>
        {filtered.map((d, idx) => <option key={`${d.province}-${d.district}`} value={idx}>{d.district} ({d.province})</option>)}
      </select>
    </div>
  );
}
