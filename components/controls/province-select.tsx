"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ISAN_PROVINCES, ZONE_LABELS, type IsanZone } from "@/lib/isan";

const ZONES: IsanZone[] = ["upper", "central", "lower"];

export function ProvinceSelect({
  value,
  param = "province",
  includeAll = false,
}: {
  value: string;
  param?: string;
  includeAll?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  function onChange(next: string) {
    const params = new URLSearchParams(search.toString());
    params.set(param, next);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-brand/40"
    >
      {includeAll && <option value="all">ทุกจังหวัด (ทั้งภูมิภาค)</option>}
      {ZONES.map((zone) => (
        <optgroup key={zone} label={ZONE_LABELS[zone].th}>
          {ISAN_PROVINCES.filter((p) => p.zone === zone).map((p) => (
            <option key={p.id} value={p.id}>
              {p.nameTh}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
