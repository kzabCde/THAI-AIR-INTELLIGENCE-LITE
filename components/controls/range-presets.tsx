"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

const PRESETS: [string, string][] = [
  ["30", "30 วัน"],
  ["90", "90 วัน"],
  ["180", "6 เดือน"],
  ["365", "1 ปี"],
];

export function RangePresets({ value, param = "range" }: { value: string; param?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  function set(next: string) {
    const params = new URLSearchParams(search.toString());
    params.set(param, next);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex gap-1 rounded-xl bg-surface-2 p-1 text-xs">
      {PRESETS.map(([key, label]) => (
        <button
          key={key}
          onClick={() => set(key)}
          className={`rounded-lg px-2.5 py-1 font-medium transition ${
            value === key ? "bg-brand text-white" : "muted hover:text-fg"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
