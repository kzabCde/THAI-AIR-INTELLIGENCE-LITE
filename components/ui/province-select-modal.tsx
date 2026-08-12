"use client";

import { useState, useRef, useEffect } from "react";
import { Search, MapPin, ChevronDown } from "lucide-react";
import { ISAN_PROVINCES } from "@/lib/isan";
import { bandForAqi, bandForPm25 } from "@/lib/aqi";
import type { ProvinceSnapshot } from "@/services/types";

export function ProvinceSelectModal({
  snapshots = [],
  selectedId = "TH-40",
  onSelect,
}: {
  snapshots?: ProvinceSnapshot[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedProvince =
    ISAN_PROVINCES.find((p) => p.id === selectedId) ?? ISAN_PROVINCES[0];

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredProvinces = ISAN_PROVINCES.filter(
    (p) =>
      p.nameTh.toLowerCase().includes(search.toLowerCase()) ||
      p.nameEn.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="relative w-full text-left min-w-0" ref={dropdownRef}>
      {/* Trigger Button - Responsive slim flex wrapper */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between gap-1.5 sm:gap-2 rounded-2xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 sm:px-3.5 sm:py-2.5 shadow-sm focus:outline-none transition hover:border-emerald-500 min-w-0"
      >
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
          <MapPin size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span className="truncate text-xs sm:text-sm font-black text-zinc-900 dark:text-zinc-100">
            {selectedProvince.nameTh} <span className="hidden sm:inline text-xs font-normal text-zinc-500">({selectedProvince.nameEn})</span>
          </span>
        </div>
        <ChevronDown
          size={14}
          className={`text-zinc-500 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180 text-emerald-600" : ""}`}
        />
      </button>

      {/* Solid Opaque Pure White Popover */}
      {isOpen && (
        <div className="absolute left-0 z-[999] mt-2 w-full origin-top-left rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 shadow-2xl transition-all animate-in fade-in zoom-in-95 duration-150">
          {/* Search Box */}
          <div className="relative mb-2">
            <Search size={16} className="absolute left-3.5 top-3.5 text-zinc-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาจังหวัด..."
              className="w-full rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 py-2.5 pl-10 pr-3 text-xs font-bold text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:border-emerald-500 focus:bg-white focus:outline-none"
              autoFocus
            />
          </div>

          {/* List of Isan Provinces */}
          <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
            {filteredProvinces.map((p) => {
              const snap = snapshots.find((s) => s.province.id === p.id);
              const aqi = snap?.aqi ?? 0;
              const pm25 = snap?.pm25 ?? 0;
              const band = snap?.aqi != null ? bandForAqi(snap.aqi) : bandForPm25(pm25);
              const isSelected = p.id === selectedId;

              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onSelect(p.id);
                    setIsOpen(false);
                    setSearch("");
                  }}
                  className={`w-full flex items-center justify-between rounded-2xl px-3.5 py-2 text-left text-xs transition ${
                    isSelected
                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 shadow-xs"
                      : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0 shadow-xs"
                      style={{ backgroundColor: band.color }}
                    />
                    <div>
                      <span className="block font-black text-xs">
                        {p.nameTh}
                      </span>
                      <span className="block text-[10px] text-zinc-500 font-normal">
                        ({p.nameEn})
                      </span>
                    </div>
                  </div>

                  {snap && (
                    <div className="flex flex-col items-center justify-center rounded-full h-8 w-11 text-white shadow-xs shrink-0 font-black leading-none py-1" style={{ backgroundColor: band.color }}>
                      <span className="text-[8px] opacity-80 uppercase tracking-tighter">AQI</span>
                      <span className="text-xs">{aqi}</span>
                    </div>
                  )}
                </button>
              );
            })}

            {filteredProvinces.length === 0 && (
              <p className="p-3 text-center text-xs text-zinc-500">ไม่พบจังหวัดที่ค้นหา</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
