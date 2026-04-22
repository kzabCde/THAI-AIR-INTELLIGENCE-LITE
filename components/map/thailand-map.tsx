"use client";

import { motion } from "framer-motion";
import { ComposableMap, Geographies, Geography, ZoomableGroup, Marker } from "react-simple-maps";
import type { ProvinceSnapshot } from "@/types/air";

const THAILAND_GEO_JSON = "https://raw.githubusercontent.com/deldersveld/topojson/master/countries/thailand/thailand-provinces.json";

function normalizeName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z\s-]/g, "")
    .replace(/\b(mueang|changwat|province)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function mapColor(pm25: number) {
  if (pm25 <= 25) return "#16a34a";
  if (pm25 <= 50) return "#facc15";
  if (pm25 <= 75) return "#f97316";
  if (pm25 <= 100) return "#ef4444";
  return "#581c87";
}

type ThailandMapProps = {
  rows: ProvinceSnapshot[];
  dayIndex: number;
  search: string;
  selectedSlug: string | null;
  timelineByProvince: Record<string, number[]>;
  onSelect: (slug: string) => void;
};

export function ThailandMap({ rows, dayIndex, search, selectedSlug, timelineByProvince, onSelect }: ThailandMapProps) {
  const provinceByName = new Map(rows.map((p) => [normalizeName(p.province_name_en), p]));

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="relative overflow-hidden rounded-3xl border border-white/30 bg-gradient-to-br from-sky-200/20 via-indigo-200/10 to-fuchsia-200/10 p-2 shadow-2xl shadow-slate-900/20 dark:border-white/10 dark:from-sky-800/20 dark:via-indigo-900/20"
    >
      <div className="pointer-events-none absolute inset-0 opacity-40 [background:radial-gradient(circle_at_20%_20%,#38bdf833,transparent_30%),radial-gradient(circle_at_80%_30%,#a855f733,transparent_35%),radial-gradient(circle_at_50%_90%,#22c55e22,transparent_40%)]" />
      <ComposableMap projection="geoMercator" projectionConfig={{ center: [101.1, 15.8], scale: 2300 }} className="h-[62vh] w-full md:h-[76vh]">
        <ZoomableGroup center={[101.2, 15.6]} zoom={1}>
          <Geographies geography={THAILAND_GEO_JSON}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const geoName = normalizeName(String((geo.properties as { NAME_1?: string }).NAME_1 ?? ""));
                const matched = provinceByName.get(geoName);
                const pm = matched ? timelineByProvince[matched.slug]?.[dayIndex] ?? matched.air.pm25 : 20;
                const isDanger = pm > 100;
                const active = matched?.slug === selectedSlug || (!!search && matched?.province_name_en.toLowerCase().includes(search.toLowerCase()));
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    onClick={() => matched && onSelect(matched.slug)}
                    style={{
                      default: {
                        fill: mapColor(pm),
                        stroke: "rgba(255,255,255,0.6)",
                        strokeWidth: active ? 1.3 : 0.7,
                        outline: "none",
                        filter: active || isDanger ? "drop-shadow(0 0 8px rgba(251,113,133,0.55))" : "none",
                        transition: "all 0.25s ease",
                      },
                      hover: {
                        fill: "#38bdf8",
                        stroke: "#f8fafc",
                        strokeWidth: 1.2,
                        outline: "none",
                        cursor: "pointer",
                        filter: "drop-shadow(0 0 10px rgba(56,189,248,0.8))",
                      },
                      pressed: {
                        fill: "#0ea5e9",
                        outline: "none",
                      },
                    }}
                  />
                );
              })
            }
          </Geographies>
          {rows
            .filter((x) => (timelineByProvince[x.slug]?.[dayIndex] ?? x.air.pm25) > 100)
            .map((x) => (
              <Marker key={x.slug} coordinates={[x.longitude, x.latitude]}>
                <circle r={4} fill="#f43f5e" className="animate-ping" />
                <circle r={2.2} fill="#fff" />
              </Marker>
            ))}
        </ZoomableGroup>
      </ComposableMap>
    </motion.div>
  );
}
