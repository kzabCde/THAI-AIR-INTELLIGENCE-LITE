"use client";

import { useEffect, useMemo, useState } from "react";
import { useThailandSnapshot } from "@/lib/hooks/use-thailand-snapshot";
import { useAppStore } from "@/lib/store/app-store";
import { motion } from "framer-motion";
import { Bell, Expand, Moon, RefreshCw, Search, SunMedium } from "lucide-react";
import { buildThailandSnapshot } from "@/lib/engine";
import { cache } from "@/lib/cache";
import { storage } from "@/lib/storage";
import type { ProvinceSnapshot } from "@/types/air";
import { StatsCard } from "@/components/ui/stats-card";
import { ThailandMap } from "@/components/ThailandMap";
import { ProvincePanel } from "@/components/ProvincePanel";
import { RankingBars } from "@/components/charts/intelligence-charts";
import { formatThaiDate, formatThaiShortTime, levelThai } from "@/lib/formatThai";
import { nextTickSeconds, shouldRefresh } from "@/lib/realtime";
import { RealtimeTicker } from "@/components/RealtimeTicker";

function generateTimeline(seed: string, base: number) {
  const seedNum = seed.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return Array.from({ length: 7 }).map((_, index) => {
    const wave = Math.sin((seedNum + index) / 3.1) * 8;
    const drift = (index - 4) * 1.3;
    return Math.max(8, +(base + wave + drift).toFixed(1));
  });
}

export function ThailandMapIntelligence() {
  const [rows, setRows] = useState<ProvinceSnapshot[]>([]);
  const { data: swrData, mutate: refreshFromApi } = useThailandSnapshot();
  const selectedSlug = useAppStore((s: { selectedProvince: string | null }) => s.selectedProvince);
  const setSelectedSlug = useAppStore((s: { setSelectedProvince: (slug: string | null) => void }) => s.setSelectedProvince);
  const favorites = useAppStore((s: { favorites: string[] }) => s.favorites);
  const toggleFavorite = useAppStore((s: { toggleFavorite: (slug: string) => void }) => s.toggleFavorite);
  const [compareSlug, setCompareSlug] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [isDark, setIsDark] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(new Date());
  const [lastRefresh, setLastRefresh] = useState({ pm25: 0, weather: 0, hotspot: 0 });
  const [pmDeltaByProvince, setPmDeltaByProvince] = useState<Record<string, number>>({});
  const [alertText, setAlertText] = useState("");

  useEffect(() => {
    const dark = storage.getDarkMode();
    setIsDark(dark);
    document.documentElement.classList.toggle("dark", dark);

    const cached = cache.getSnapshot();
    if (cached.length) {
      setRows(cached);
      setUpdatedAt(new Date());
    }

    const load = async () => {
      const latest = await buildThailandSnapshot();
      setRows(latest);
      setUpdatedAt(new Date());
      const now = Date.now();
      setLastRefresh({ pm25: now, weather: now, hotspot: now });
    };

    load();
  }, []);


  useEffect(() => {
    if (!swrData?.data?.length) return;
    setRows(swrData.data);
    setUpdatedAt(new Date(swrData.updatedAt));
  }, [swrData]);
  useEffect(() => {
    const timer = window.setInterval(async () => {
      const now = Date.now();
      if (!shouldRefresh(lastRefresh.pm25, "pm25", now) && !shouldRefresh(lastRefresh.weather, "weather", now) && !shouldRefresh(lastRefresh.hotspot, "hotspot", now)) {
        return;
      }

      const latest = await buildThailandSnapshot();
      setRows((prev) => {
        const delta = Object.fromEntries(latest.map((row) => {
          const old = prev.find((p) => p.slug === row.slug)?.air.pm25 ?? row.air.pm25;
          return [row.slug, +(row.air.pm25 - old).toFixed(1)];
        }));
        setPmDeltaByProvince(delta);
        return latest;
      });

      setUpdatedAt(new Date());
      setLastRefresh((prev) => ({
        pm25: shouldRefresh(prev.pm25, "pm25", now) ? now : prev.pm25,
        weather: shouldRefresh(prev.weather, "weather", now) ? now : prev.weather,
        hotspot: shouldRefresh(prev.hotspot, "hotspot", now) ? now : prev.hotspot,
      }));
    }, 5000);

    return () => clearInterval(timer);
  }, [lastRefresh]);

  useEffect(() => {
    const over100 = rows.find((r) => r.air.pm25 > 100);
    if (!over100) return;

    setAlertText(`⚠️ แจ้งเตือนค่าฝุ่นสูง จังหวัด${over100.province_name_th}`);
    const audioCtx = new AudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.015;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.2);

    const timer = setTimeout(() => setAlertText(""), 4000);
    return () => clearTimeout(timer);
  }, [rows]);

  const timelineByProvince = useMemo(() => Object.fromEntries(rows.map((x) => [x.slug, generateTimeline(x.slug, x.air.pm25)])), [rows]);
  const ranked = useMemo(() => [...rows].sort((a, b) => b.air.pm25 - a.air.pm25), [rows]);
  const average = useMemo(() => (ranked.length ? ranked.reduce((sum, x) => sum + x.air.pm25, 0) / ranked.length : 0), [ranked]);
  const selected = rows.find((x) => x.slug === selectedSlug) ?? null;
  const compareWith = rows.find((x) => x.slug === compareSlug) ?? null;

  const refresh = async () => {
    await refreshFromApi();
  };

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    storage.setDarkMode(next);
    document.documentElement.classList.toggle("dark", next);
  };

  const worst = ranked[0];
  const cleanest = ranked[ranked.length - 1];

  return (
    <section className="min-h-[90vh] space-y-4">
      <div className="sticky top-0 z-40 rounded-2xl border border-white/30 bg-white/90 p-3 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/85">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <p className="mr-auto text-sm font-bold text-sky-700 dark:text-sky-300">แดชบอร์ดคุณภาพอากาศประเทศไทย</p>
          <label className="flex items-center gap-2 rounded-xl border border-slate-300/70 bg-white/80 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900/60">
            <Search size={15} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 ค้นหาจังหวัด..." className="w-32 bg-transparent outline-none md:w-52" />
          </label>
          <button onClick={refresh} className="rounded-xl border border-slate-300 p-2 dark:border-slate-700" title="รีเฟรชข้อมูล"><RefreshCw size={16} /></button>
          <button onClick={toggleTheme} className="rounded-xl border border-slate-300 p-2 dark:border-slate-700" title="โหมดกลางคืน">{isDark ? <SunMedium size={16} /> : <Moon size={16} />}</button>
          <button onClick={() => document.documentElement.requestFullscreen?.()} className="rounded-xl border border-slate-300 p-2 dark:border-slate-700" title="เต็มหน้าจอ"><Expand size={16} /></button>
        </div>

        <div className="grid gap-2 md:grid-cols-2">
          <RealtimeTicker updatedAt={updatedAt} />
          <div className="rounded-xl border border-slate-200/60 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900/40">
            <p>วันนี้ {formatThaiDate(new Date())} • อัปเดต {formatThaiShortTime(updatedAt)}</p>
            <p>รอบถัดไป PM2.5 {nextTickSeconds(lastRefresh.pm25, "pm25")} วิ • อากาศ {nextTickSeconds(lastRefresh.weather, "weather")} วิ • จุดความร้อน {nextTickSeconds(lastRefresh.hotspot, "hotspot")} วิ</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-3">
          <div className="sticky top-24 z-20 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs dark:border-sky-800 dark:bg-sky-950/30 md:hidden">
            PM ไทยเฉลี่ย {average.toFixed(1)} | จังหวัดเสี่ยงสุด {worst?.province_name_th ?? "-"} | อัปเดตล่าสุด {formatThaiShortTime(updatedAt)}
          </div>
          <ThailandMap rows={rows} search={search} selectedSlug={selectedSlug} pmDeltaByProvince={pmDeltaByProvince} onSelect={setSelectedSlug} />

          <div className="rounded-2xl border border-white/30 bg-white/70 p-3 text-sm backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/60">
            <p className="font-semibold">ระดับสีเพื่อเข้าใจง่าย</p>
            <p className="mt-1 text-xs">0-25 ดีมาก 🟢 | 26-50 ดี 🟡 | 51-75 ปานกลาง 🟠 | 76-100 เริ่มมีผลกระทบ 🔴 | 101-150 อันตราย 🟣 | 151+ วิกฤต ⚫</p>
          </div>
        </div>

        <motion.aside initial={{ opacity: 0, x: 15 }} animate={{ opacity: 1, x: 0 }} className="space-y-4 rounded-3xl border border-white/30 bg-white/70 p-4 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/65">
          <div className="grid gap-3 sm:grid-cols-2">
            <StatsCard title="ค่าเฉลี่ยประเทศไทย" value={`${average.toFixed(1)} μg/m³`} hint="สรุปภาพรวมประเทศ" tone="warn" />
            <StatsCard title="จังหวัดเสี่ยงสุดวันนี้" value={worst ? worst.province_name_th : "-"} hint={worst ? `${worst.air.pm25.toFixed(1)} (${levelThai(worst.air.pm25).label})` : "ไม่มีข้อมูล"} tone="danger" />
            <StatsCard title="จังหวัดดีที่สุด" value={cleanest ? cleanest.province_name_th : "-"} hint={cleanest ? `${cleanest.air.pm25.toFixed(1)} (${levelThai(cleanest.air.pm25).label})` : "ไม่มีข้อมูล"} tone="good" />
            <StatsCard title="คาดการณ์พรุ่งนี้" value={`${(average * 1.05).toFixed(1)} μg/m³`} hint="คำนวณใหม่ทุกครั้งที่อัปเดต" tone="neutral" />
          </div>

          <div className="rounded-2xl border border-slate-200/60 p-3 dark:border-slate-700/60">
            <p className="text-sm font-semibold">10 จังหวัดค่าฝุ่นสูงสุด</p>
            <RankingBars data={ranked.slice(0, 10).map((x) => ({ name: x.province_name_th, value: +x.air.pm25.toFixed(1) }))} />
          </div>

          <div className="rounded-2xl border border-slate-200/60 p-3 text-sm dark:border-slate-700/60">
            <p className="font-semibold">AI วิเคราะห์ง่ายๆ</p>
            <p className="mt-2 text-slate-600 dark:text-slate-300">{worst ? `${worst.province_name_th}มีแนวโน้ม${pmDeltaByProvince[worst.slug] > 0 ? "เพิ่มขึ้น" : "ทรงตัว"} เนื่องจากจุดความร้อน ${worst.hotspot_count} จุด และลม ${worst.weather.wind} m/s` : "กำลังโหลดการวิเคราะห์..."}</p>
          </div>

          <div className="rounded-2xl border border-slate-200/60 p-3 text-sm dark:border-slate-700/60">
            <p className="font-semibold">จังหวัดโปรด</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {rows.slice(0, 12).map((item) => (
                <button key={item.slug} onClick={() => toggleFavorite(item.slug)} className="rounded-full border px-3 py-1 text-xs">
                  {favorites.includes(item.slug) ? "★" : "☆"} {item.province_name_th}
                </button>
              ))}
            </div>
          </div>

          <button onClick={() => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}`, "_blank")} className="w-full rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">แชร์ภาพค่าฝุ่นลง Facebook</button>
        </motion.aside>
      </div>

      <ProvincePanel selected={selected} timeline={selected ? timelineByProvince[selected.slug] : []} compareWith={compareWith} onClose={() => setSelectedSlug(null)} onCompare={(slug) => setCompareSlug(slug)} />

      {alertText && (
        <div className="fixed bottom-20 right-4 z-[60] max-w-sm rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 shadow-xl dark:border-amber-700 dark:bg-amber-950/80 dark:text-amber-100">
          <p className="flex items-center gap-2 font-semibold"><Bell size={15} />{alertText}</p>
        </div>
      )}
    </section>
  );
}
