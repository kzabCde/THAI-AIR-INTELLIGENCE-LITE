"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { ArrowUpRight, Database, MapPinned, ShieldAlert, Sparkles } from "lucide-react";
import { MapControlPanel } from "@/components/map/MapControlPanel";
import { RegionSummaryCard } from "@/components/map/RegionSummaryCard";
import { ThailandRegionMap } from "@/components/map/ThailandRegionMap";
import { Card } from "@/components/ui/card";
import { getAqiCategory, REGION_COLORS, type ThaiRegionName } from "@/lib/map/region-colors";
import { buildMapProvinces, groupProvincesByRegion, type DisplayMode, type MapProvince } from "@/lib/map/province-region";
import { useThailandSnapshot } from "@/lib/hooks/use-thailand-snapshot";

const PAGE_TEXT = {
  title: "แผนที่คุณภาพอากาศประเทศไทย",
  subtitle: "แสดงข้อมูลคุณภาพอากาศตามจังหวัดและภูมิภาค พร้อมรองรับการเปรียบเทียบ PM2.5 / PM10 / AQI",
  empty: "ไม่พบจังหวัดที่ตรงกับคำค้นหา",
};

const RISK_LABELS: Record<string, string> = {
  Excellent: "ดีมาก",
  Good: "ดี",
  Moderate: "ปานกลาง",
  "Unhealthy Sensitive": "เริ่มมีผลกระทบต่อกลุ่มเสี่ยง",
  Unhealthy: "มีผลกระทบต่อสุขภาพ",
  Hazardous: "อันตราย",
};

function matchesAqiFilter(province: MapProvince, filter: string) {
  if (filter === "good") return province.mockAqi <= 25;
  if (filter === "moderate") return province.mockAqi > 25 && province.mockAqi <= 50;
  if (filter === "sensitive") return province.mockAqi > 50 && province.mockAqi <= 100;
  if (filter === "unhealthy") return province.mockAqi > 100;
  return true;
}

export default function MapPage() {
  const { data, error, isLoading } = useThailandSnapshot();
  const [search, setSearch] = useState("");
  const [selectedSlug, setSelectedSlug] = useState<string | null>("bangkok");
  const [selectedRegion, setSelectedRegion] = useState<"all" | ThaiRegionName>("all");
  const [displayMode, setDisplayMode] = useState<DisplayMode>("region");
  const [aqiFilter, setAqiFilter] = useState("all");

  const provinces = useMemo(() => buildMapProvinces(data?.data, data?.updatedAt), [data?.data, data?.updatedAt]);
  const grouped = useMemo(() => groupProvincesByRegion(provinces), [provinces]);
  const selectedProvince = provinces.find((province) => province.slug === selectedSlug) ?? provinces[0] ?? null;

  const filteredProvinces = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("th-TH");
    return provinces.filter((province) => {
      const matchesSearch = !keyword || `${province.province_name_th} ${province.province_name_en}`.toLocaleLowerCase("th-TH").includes(keyword);
      const matchesRegion = selectedRegion === "all" || province.normalizedRegion === selectedRegion;
      return matchesSearch && matchesRegion && matchesAqiFilter(province, aqiFilter);
    });
  }, [aqiFilter, provinces, search, selectedRegion]);

  const visibleProvinceSlugs = useMemo(() => new Set(filteredProvinces.map((province) => province.slug)), [filteredProvinces]);
  const highRiskProvinces = provinces.filter((province) => province.mockAqi > 100).length;
  const averageCountryAqi = provinces.length ? Math.round(provinces.reduce((sum, province) => sum + province.mockAqi, 0) / provinces.length) : 0;

  const filteredGrouped = useMemo(() => groupProvincesByRegion(filteredProvinces), [filteredProvinces]);

  function resetFilters() {
    setSearch("");
    setSelectedRegion("all");
    setAqiFilter("all");
    setDisplayMode("region");
  }

  return (
    <section className="-mx-4 -my-6 min-h-screen bg-slate-950 px-4 py-6 text-slate-100 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-slate-900 via-slate-950 to-cyan-950/60 p-6 shadow-2xl shadow-black/30">
          <div className="pointer-events-none absolute inset-0 opacity-80 [background:radial-gradient(circle_at_10%_10%,rgba(34,211,238,0.2),transparent_25%),radial-gradient(circle_at_80%_20%,rgba(250,204,21,0.12),transparent_28%),radial-gradient(circle_at_58%_85%,rgba(20,184,166,0.14),transparent_32%)]" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs font-semibold text-cyan-100">
                <Sparkles className="h-3.5 w-3.5" />
                Thailand Regional Air Map · Demo Data
              </div>
              <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">{PAGE_TEXT.title}</h1>
              <p className="mt-2 text-sm leading-6 text-slate-300 sm:text-base">{PAGE_TEXT.subtitle}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-slate-300 backdrop-blur">
              <p className="font-semibold text-white">หมายเหตุข้อมูล</p>
              <p>ค่า AQI / PM2.5 / PM10 แสดงด้วยป้าย Demo Data เพื่อไม่อ้างว่าเป็นข้อมูลสด</p>
            </div>
          </div>
        </header>

        {error && (
          <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 p-3 text-sm text-amber-100">
            เชื่อมต่อข้อมูลสดไม่สำเร็จ: {error} · ระบบจะแสดง Demo Data สำหรับหน้าสาธิต
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={<MapPinned className="h-5 w-5" />} label="จำนวนจังหวัดทั้งหมด" value={`${provinces.length || 77}`} accent="text-cyan-200" />
          <StatCard icon={<Database className="h-5 w-5" />} label="ภูมิภาคทั้งหมด" value="7" accent="text-emerald-200" />
          <StatCard icon={<ShieldAlert className="h-5 w-5" />} label="จังหวัดเสี่ยงสูง" value={`${highRiskProvinces}`} accent="text-rose-200" />
          <StatCard icon={<Sparkles className="h-5 w-5" />} label="ค่า AQI เฉลี่ยประเทศ" value={`${averageCountryAqi}`} accent="text-amber-200" sourceBadge />
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(380px,0.8fr)]">
          <div className="space-y-4">
            <ThailandRegionMap
              provinces={provinces}
              visibleProvinceSlugs={visibleProvinceSlugs}
              selectedSlug={selectedSlug}
              displayMode={displayMode}
              onSelect={setSelectedSlug}
            />
            {isLoading && <p className="text-xs text-slate-400">กำลังเตรียมข้อมูลแผนที่และค่า Demo Data...</p>}
          </div>

          <aside className="space-y-4">
            <MapControlPanel
              search={search}
              region={selectedRegion}
              mode={displayMode}
              aqiCategory={aqiFilter}
              onSearchChange={setSearch}
              onRegionChange={setSelectedRegion}
              onModeChange={setDisplayMode}
              onAqiCategoryChange={setAqiFilter}
              onReset={resetFilters}
            />

            {selectedProvince && <SelectedProvinceCard province={selectedProvince} />}

            <Card className="border-white/10 bg-slate-950/70 p-4 shadow-2xl shadow-black/20">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-white">สรุปตามภูมิภาค</h2>
                  <p className="text-xs text-slate-400">ค่าเฉลี่ยและจังหวัดที่มี AQI สูงสุดในแต่ละภูมิภาค</p>
                </div>
                <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-semibold text-slate-300">7 regions</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                {grouped.map((group) => (
                  <RegionSummaryCard key={group.region} {...group} compact={false} />
                ))}
              </div>
            </Card>

            <Card className="border-white/10 bg-slate-950/70 p-4 shadow-2xl shadow-black/20">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-white">รายการจังหวัดตามภูมิภาค</h2>
                  <p className="text-xs text-slate-400">คลิกชื่อจังหวัดเพื่อเลือกบนแผนที่</p>
                </div>
                <span className="rounded-full bg-cyan-300/10 px-2 py-1 text-[10px] font-semibold text-cyan-100">{filteredProvinces.length} จังหวัด</span>
              </div>

              {filteredProvinces.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 p-6 text-center text-sm text-slate-300">
                  {PAGE_TEXT.empty}
                </div>
              ) : (
                <div className="max-h-[760px] space-y-3 overflow-y-auto pr-1">
                  {filteredGrouped.filter((group) => group.provinceCount > 0).map((group) => (
                    <ProvinceGroup key={group.region} group={group} selectedSlug={selectedSlug} onSelect={setSelectedSlug} />
                  ))}
                </div>
              )}
            </Card>
          </aside>
        </div>
      </div>
    </section>
  );
}

function StatCard({ icon, label, value, accent, sourceBadge = false }: { icon: ReactNode; label: string; value: string; accent: string; sourceBadge?: boolean }) {
  return (
    <Card className="border-white/10 bg-slate-950/70 p-4 shadow-xl shadow-black/20">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-slate-400">{label}</p>
          <div className="mt-1 flex flex-wrap items-end gap-2">
            <p className={`text-2xl font-black ${accent}`}>{value}</p>
            {sourceBadge && <span className="mb-1 rounded-full bg-cyan-300/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-100">Demo Data</span>}
          </div>
        </div>
        <div className={`rounded-2xl border border-white/10 bg-white/5 p-3 ${accent}`}>{icon}</div>
      </div>
    </Card>
  );
}

function SelectedProvinceCard({ province }: { province: MapProvince }) {
  const regionColor = REGION_COLORS[province.normalizedRegion];
  const category = getAqiCategory(province.mockAqi);
  const updated = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(province.lastUpdated));

  return (
    <Card className="overflow-hidden border-white/10 bg-slate-950/70 p-0 shadow-2xl shadow-black/20">
      <div className="p-4" style={{ background: `linear-gradient(135deg, ${regionColor.soft}, rgba(15,23,42,0.92))` }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-slate-300">จังหวัดที่เลือก</p>
            <h2 className="text-2xl font-black text-white">{province.province_name_th}</h2>
            <p className="text-sm text-slate-300">{province.province_name_en}</p>
          </div>
          <span className="rounded-full border px-3 py-1 text-xs font-bold" style={{ borderColor: regionColor.border, color: regionColor.text }}>{province.normalizedRegion}</span>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <Metric label="PM2.5" value={province.mockPm25.toFixed(1)} unit="µg/m³" />
          <Metric label="PM10" value={province.mockPm10.toFixed(1)} unit="µg/m³" />
          <Metric label="AQI" value={province.mockAqi.toFixed(0)} unit={category.label} color={category.text} />
        </div>

        <div className="mt-3 rounded-2xl border border-white/10 bg-slate-950/35 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-slate-400">AQI category</span>
            <span className="font-bold" style={{ color: category.text }}>{category.label}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-slate-400">Risk level</span>
            <span className="font-bold text-white">{RISK_LABELS[province.risk_level] ?? province.risk_level}</span>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2 py-1 font-semibold text-cyan-100">Demo Data</span>
          <span>Last updated: {updated}</span>
        </div>

        <Link href={`/province/${province.slug}`} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-200">
          ดูรายละเอียดจังหวัด
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>
    </Card>
  );
}

function Metric({ label, value, unit, color = "#ffffff" }: { label: string; value: string; unit: string; color?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-black" style={{ color }}>{value}</p>
      <p className="truncate text-[10px] text-slate-400">{unit}</p>
    </div>
  );
}

function ProvinceGroup({ group, selectedSlug, onSelect }: {
  group: ReturnType<typeof groupProvincesByRegion>[number];
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
}) {
  const color = REGION_COLORS[group.region];
  const category = getAqiCategory(group.averageAqi);

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: color.base }} />
          <h3 className="truncate text-sm font-bold text-white">{group.region}</h3>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-slate-300">{group.provinceCount} จังหวัด</span>
        </div>
        <span className="rounded-full border border-white/10 bg-slate-950/40 px-2 py-1 text-[10px] font-bold" style={{ color: category.text }}>เฉลี่ย AQI {group.averageAqi} · Demo</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {group.provinces.map((province) => {
          const active = province.slug === selectedSlug;
          return (
            <button
              key={province.slug}
              type="button"
              onClick={() => onSelect(province.slug)}
              className={active
                ? "max-w-full rounded-full border px-3 py-1.5 text-xs font-bold text-slate-950 shadow-lg"
                : "max-w-full rounded-full border border-white/10 bg-slate-900/80 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-white/25 hover:bg-white/10"}
              style={active ? { backgroundColor: color.base, borderColor: color.base } : undefined}
              title={`${province.province_name_th} (${province.province_name_en})`}
            >
              <span className="block truncate">{province.province_name_th}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
