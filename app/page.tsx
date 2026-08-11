import { Activity, Flame, Gauge, Wind } from "lucide-react";
import { AQI_BANDS } from "@/lib/aqi";
import { fmtDateTh, fmtNumber, fmtPm25, isHotspotDataStale } from "@/lib/format";
import { isNetworkRestrictedError } from "@/services/_db";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getRegionOverview } from "@/services/overview.service";
import { KpiCard } from "@/components/ui/kpi-card";
import { Section } from "@/components/ui/card";
import { IsanMapCard } from "@/components/map/isan-map-card";
import { LiveProvinceTable } from "@/components/overview/live-province-table";
import { ProvinceHeroCard } from "@/components/overview/province-hero-card";
import { AiForecastHighlights } from "@/components/overview/ai-forecast-highlights";
import { HealthAdviceGrid } from "@/components/overview/health-advice-grid";
import { QuickShortcutsGrid } from "@/components/overview/quick-shortcuts-grid";
import { AnnouncementBanner } from "@/components/overview/announcement-banner";
import { ErrorBoundary } from "@/components/error-boundary";
import { NotConfiguredState, ErrorState, NetworkRestrictedState } from "@/components/ui/states";
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

  // Initial province for the Hero Gauge card (default to worst province or Khon Kaen)
  const initialProvinceId = overview.worst?.province.id ?? "TH-40";

  return (
    <div className="space-y-8">
      {/* 1. Hero Featured Province Card with AQI Gauge & Weather */}
      <ProvinceHeroCard
        snapshots={overview.snapshots}
        initialProvinceId={initialProvinceId}
      />

      {/* 2. Regional 4-KPI Overview Grid */}
      <div>
        <h2 className="text-lg font-bold tracking-tight mb-3">ภาพรวมภาคตะวันออกเฉียงเหนือ</h2>
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
            label="จังหวัดฝุ่นสูงสุด"
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
            label="จุดความร้อนรวมวันนี้"
            value={fmtNumber(overview.totalHotspots)}
            unit="จุด"
            icon={<Flame size={16} />}
            hint={
              overview.hotspotDate
                ? isHotspotDataStale(overview.hotspotDate)
                  ? `ไม่พบข้อมูลใหม่ตั้งแต่ ${fmtDateTh(overview.hotspotDate)}`
                  : `จากดาวเทียม NASA FIRMS · ${fmtDateTh(overview.hotspotDate)}`
                : "ไม่มีข้อมูลจากดาวเทียม FIRMS"
            }
          />
        </div>
      </div>

      {/* 3. Live Google Satellite Map & AQI Distribution */}
      <Section
        title="แผนที่คุณภาพอากาศภาคอีสาน"
        description="แตะที่หมุดจังหวัดเพื่อดูรายละเอียด · ภาพดาวเทียม Google Maps"
      >
        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <IsanMapCard provinces={mapProvinces} />
          <div className="card card-pad flex flex-col justify-between">
            <div>
              <p className="section-title">สัดส่วนคุณภาพอากาศ</p>
              <p className="muted text-xs mb-3">จำนวนจังหวัดแบ่งตามหมวด AQI 20 จังหวัด</p>
              <div className="space-y-2.5">
                {AQI_BANDS.map((b) => {
                  const count = overview.levelCounts[b.level];
                  const pct = (count / overview.provinceCount) * 100;
                  return (
                    <div key={b.level}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="inline-flex items-center gap-1.5 font-medium">
                          <span className="h-2.5 w-2.5 rounded-full shadow-xs" style={{ background: b.color }} />
                          {b.labelTh}
                        </span>
                        <span className="muted tabular-nums font-bold">{count} จังหวัด</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, background: b.color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* 4. AI Forecast Highlights */}
      <AiForecastHighlights snapshots={overview.snapshots} />

      {/* 5. Live Province Ranking Table */}
      <Section
        title="ตารางจัดอันดับคุณภาพอากาศ 20 จังหวัด"
        description="เรียงตามค่าฝุ่น PM2.5 ล่าสุด · อัปเดตอัตโนมัติแบบเรียลไทม์"
      >
        <ErrorBoundary>
          <LiveProvinceTable initial={overview} />
        </ErrorBoundary>
      </Section>

      {/* 6. Health Recommendations */}
      <HealthAdviceGrid avgPm25={overview.avgPm25} />

      {/* 7. Quick Shortcuts */}
      <QuickShortcutsGrid />

      {/* 8. Announcement Banner */}
      <AnnouncementBanner />
    </div>
  );
}
