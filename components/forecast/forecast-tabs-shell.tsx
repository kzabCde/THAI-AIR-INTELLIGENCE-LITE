"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Globe, MapPin } from "lucide-react";
import { RedesignedForecastDashboard } from "./redesigned-forecast-dashboard";
import { RegionalForecastDashboard } from "./regional-forecast-dashboard";
import { ProvinceSelectModal } from "@/components/ui/province-select-modal";
import type { IsanProvince } from "@/lib/isan";
import type { ProvinceForecast } from "@/services/types";
import type { WeatherRow } from "@/services/weather.service";
import type { RegionOverview } from "@/services/types";
import type { RegionalForecastSummary } from "@/services/regional-forecast.service";

type Tab = "regional" | "province";

export function ForecastTabsShell({
  province,
  forecast,
  weather,
  overview,
  regionalForecast,
  initialTab = "regional",
}: {
  province: IsanProvince;
  forecast: ProvinceForecast;
  weather: WeatherRow | null;
  overview: RegionOverview;
  regionalForecast: RegionalForecastSummary;
  initialTab?: Tab;
}) {
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    setActiveTab(searchParams.get("tab") === "province" ? "province" : "regional");
  }, [searchParams]);

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`/forecast?${params.toString()}`, { scroll: false });
  };

  const handleProvinceSelect = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("province", id);
    params.set("tab", "province");
    setActiveTab("province");
    router.push(`/forecast?${params.toString()}`);
  };

  return (
    <div className="mx-auto max-w-[1440px] space-y-5">
      {/* ── Tab Bar ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-1">
          {/* Regional Tab */}
          <button
            onClick={() => handleTabChange("regional")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all sm:px-5 ${
              activeTab === "regional"
                ? "bg-teal-700 text-white shadow-md shadow-teal-900/10 dark:bg-teal-500"
                : "text-[rgb(var(--muted))] hover:bg-[rgb(var(--surface-2))] hover:text-[rgb(var(--fg))]"
            }`}
          >
            <Globe size={14} />
            ทั้งภาคอีสาน
          </button>

          {/* Province Tab */}
          <button
            onClick={() => handleTabChange("province")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all sm:px-5 ${
              activeTab === "province"
                ? "bg-teal-700 text-white shadow-md shadow-teal-900/10 dark:bg-teal-500"
                : "text-[rgb(var(--muted))] hover:bg-[rgb(var(--surface-2))] hover:text-[rgb(var(--fg))]"
            }`}
          >
            <MapPin size={14} />
            รายจังหวัด
          </button>

          {/* Province selector — shown when province tab is active */}
          {activeTab === "province" && (
            <div className="ml-auto w-40 sm:w-48">
              <ProvinceSelectModal
                snapshots={overview.snapshots}
                selectedId={province.id}
                onSelect={handleProvinceSelect}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Tab Content ─────────────────────────────────────── */}
      {activeTab === "regional" ? (
        <RegionalForecastDashboard summary={regionalForecast} />
      ) : (
        <RedesignedForecastDashboard
          province={province}
          forecast={forecast}
          weather={weather}
          overview={overview}
        />
      )}
    </div>
  );
}
