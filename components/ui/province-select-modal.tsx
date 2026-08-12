"use client";

import { useState, useRef, useEffect } from "react";
import { Search, MapPin, ChevronDown, X } from "lucide-react";
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
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between gap-1.5 rounded-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 shadow-sm focus:outline-none transition hover:border-emerald-500 min-w-0"
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <MapPin size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span className="truncate text-xs font-bold text-slate-900 dark:text-slate-100">
            {selectedProvince.nameTh}
          </span>
        </div>
        <ChevronDown
          size={12}
          className={`text-slate-500 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180 text-emerald-600" : ""}`}
        />
      </button>

      {/* Dropdown Panel — fixed overlay to prevent clipping */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[998] bg-black/20 backdrop-blur-[1px]"
            onClick={() => { setIsOpen(false); setSearch(""); }}
          />
          {/* Panel */}
          <div className="fixed left-4 right-4 top-24 z-[999] mx-auto max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-2xl sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-80">
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">เลือกจังหวัด</h3>
              <button
                onClick={() => { setIsOpen(false); setSearch(""); }}
                className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={14} className="text-slate-500" />
              </button>
            </div>

            {/* Search Box */}
            <div className="relative mb-2">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ค้นหาจังหวัด..."
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 py-2 pl-8 pr-3 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none"
                autoFocus
              />
            </div>

            {/* Province List — compact single-line items */}
            <div className="max-h-72 overflow-y-auto space-y-0.5 pr-0.5">
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
                    className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-left transition ${
                      isSelected
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 border border-emerald-500/30"
                        : "hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 border border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: band.color }}
                      />
                      <span className="truncate text-xs font-bold">{p.nameTh}</span>
                      <span className="truncate text-[10px] text-slate-400 font-normal">{p.nameEn}</span>
                    </div>

                    {snap && (
                      <span
                        className="ml-2 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                        style={{ backgroundColor: band.color }}
                      >
                        {aqi}
                      </span>
                    )}
                  </button>
                );
              })}

              {filteredProvinces.length === 0 && (
                <p className="p-3 text-center text-xs text-slate-500">ไม่พบจังหวัดที่ค้นหา</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
