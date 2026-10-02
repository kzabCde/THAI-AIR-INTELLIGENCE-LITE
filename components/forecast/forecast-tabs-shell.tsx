"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Globe, MapPin } from "lucide-react";
import { RedesignedForecastDashboard } from "./redesigned-forecast-dashboard";
import { RegionalForecastDashboard } from "./regional-forecast-dashboard";
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

  return (
    <div className="mx-auto max-w-[1440px] space-y-5">
      {/* ── Tab Bar ─────────────────────────────────────────── */}
      <div className="border-b border-[rgb(var(--border))]">
        <div className="flex items-center gap-6">
          <TabButton
            active={activeTab === "regional"}
            icon={<Globe size={15} />}
            label="ทั้งภาคอีสาน"
            onClick={() => handleTabChange("regional")}
          />
          <TabButton
            active={activeTab === "province"}
            icon={<MapPin size={15} />}
            label="รายจังหวัด"
            onClick={() => handleTabChange("province")}
          />
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

/* ── Tab Button — underline style, no pill ───────────────── */
function TabButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-2 pb-3 pt-1 text-sm font-bold transition-colors ${
        active
          ? "text-teal-700 dark:text-teal-400"
          : "text-[rgb(var(--muted))] hover:text-[rgb(var(--fg))]"
      }`}
    >
      {icon}
      {label}
      {/* Active underline indicator */}
      {active && (
        <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-teal-600 dark:bg-teal-400" />
      )}
    </button>
  );
}
