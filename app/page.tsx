import { Activity, Flame, Gauge, MapPin, Wind } from "lucide-react";
import { ZONE_LABELS } from "@/lib/isan";
import { AQI_BANDS } from "@/lib/aqi";
import { fmtNumber, fmtPm25, fmtRelativeTh } from "@/lib/format";
import { isNetworkRestrictedError } from "@/services/_db";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getRegionOverview } from "@/services/overview.service";
import { KpiCard } from "@/components/ui/kpi-card";
import { Section } from "@/components/ui/card";
import { IsanMapCard } from "@/components/map/isan-map-card";
import { LiveProvinceTable } from "@/components/overview/live-province-table";
import { ErrorBoundary } from "@/components/error-boundary";
import { NotConfiguredState, ErrorState , NetworkRestrictedState } from "@/components/ui/states";
import type { MapProvince } from "@/components/map/types";

export const revalidate = 300;

export default async function OverviewPage() {
  if (!isSupabaseConfigured) return <NotConfiguredState />;

  let overview;
  try {
    overview = await getRegionOverview();
  } catch (err) {
    if (isNetworkRestrictedError(err)) return <NetworkRestrictedState />;
    return <ErrorState description="ไม่สามารถเชื่อมต่อฐานข้อมูล Supabase ได้" />;
  }

  const mapProvinces: MapProvince[] = overview.snapshots.map((s) => ({
    id: s.province.id,
    slug: s.province.slug,
    nameTh: s.province.nameTh,
    nameEn: s.province.nameEn,
    lat: s.province.lat,
    lon: s.province.lon,
    pm25: s.pm25,
    aqi: s.aqi,
    color: s.band.color,
    labelTh: s.band.labelTh,
    temperature: s.temperature,
    humidity: s.humidity,
    windSpeed: s.windSpeed,
    observedAt: s.observedAt,
  }));

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">ภาพรวมคุณภาพอากาศภาคอีสาน</h1>
          <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-semibold text-brand">
            20 จังหวัด
          </span>
        </div>
        <p className="muted mt-1 text-sm">
          ข้อมูลล่าสุด {fmtRelativeTh(overview.observedAt)} · แหล่งข้อมูล Supabase
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="PM2.5 เฉลี่ยภูมิภาค"
          value={fmtPm25(overview.avgPm25)}
          unit="µg/m³"
          icon={<Gauge size={16} />}
          accent={AQI_BANDS.find((b) => overview.avgPm25 <= b.pm25Max)?.color}
          hint={`AQI เฉลี่ย ${overview.avgAqi}`}
        />
        <KpiCard
          label="จังหวัดค่าฝุ่นสูงสุด"
          value={overview.worst?.province.nameTh ?? "–"}
          icon={<Activity size={16} />}
          accent={overview.worst?.band.color}
          hint={overview.worst ? `${fmtPm25(overview.worst.pm25)} µg/m³ · ${overview.worst.band.labelTh}` : ""}
        />
        <KpiCard
          label="จังหวัดอากาศดีสุด"
          value={overview.best?.province.nameTh ?? "–"}
          icon={<Wind size={16} />}
          accent={overview.best?.band.color}
          hint={overview.best ? `${fmtPm25(overview.best.pm25)} µg/m³` : ""}
        />
        <KpiCard
          label="จุดความร้อนรวม"
          value={fmtNumber(overview.totalHotspots)}
          unit="จุด"
          icon={<Flame size={16} />}
          hint="จากดาวเทียม FIRMS (ล่าสุด)"
        />
      </div>

      <Section
        title="แผนที่ความเข้มข้น PM2.5"
        description="แตะที่จังหวัดเพื่อดูรายละเอียด · ขนาดวงกลมแปรผันตามค่าฝุ่น"
      >
        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <IsanMapCard provinces={mapProvinces} />
          <div className="card card-pad">
            <p className="section-title">การกระจายระดับคุณภาพอากาศ</p>
            <div className="mt-3 space-y-2.5">
              {AQI_BANDS.map((b) => {
                const count = overview.levelCounts[b.level];
                const pct = (count / overview.provinceCount) * 100;
                return (
                  <div key={b.level}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: b.color }} />
                        {b.labelTh}
                      </span>
                      <span className="muted tabular-nums">{count} จังหวัด</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: b.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="muted mt-4 flex items-center gap-1.5 text-xs">
              <MapPin size={13} /> ครอบคลุมเฉพาะภาคตะวันออกเฉียงเหนือ
            </p>
          </div>
        </div>
      </Section>

      <Section title="อันดับจังหวัด" description="เรียงตามค่าฝุ่น PM2.5 ล่าสุด · อัปเดตอัตโนมัติแบบเรียลไทม์">
        <ErrorBoundary>
          <LiveProvinceTable initial={overview} />
        </ErrorBoundary>
      </Section>
    </div>
  );
}
