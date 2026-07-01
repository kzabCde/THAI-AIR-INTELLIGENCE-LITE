/** Formatting helpers (Thai locale aware). Safe for server and client. */

const TH = "th-TH";

export function fmtNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  return value.toLocaleString(TH, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtPm25(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  return value.toFixed(1);
}

export function fmtDateTimeTh(iso: string | null | undefined): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleString(TH, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function fmtDateTh(iso: string | null | undefined): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleDateString(TH, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function fmtTimeTh(iso: string | null | undefined): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleTimeString(TH, { hour: "2-digit", minute: "2-digit" });
}

/** Human "x นาทีที่แล้ว" relative time. `now` lets callers drive a live clock. */
export function fmtRelativeTh(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "ไม่มีข้อมูล";
  const diffMs = now - new Date(iso).getTime();
  const min = Math.round(diffMs / 60000);
  if (min < 1) return "เมื่อสักครู่";
  if (min < 60) return `${min} นาทีที่แล้ว`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} ชั่วโมงที่แล้ว`;
  const day = Math.round(hr / 24);
  return `${day} วันที่แล้ว`;
}

/** FIRMS hotspot data lands ~1 day behind; flag anything older as stale so
 *  hotspot KPIs don't imply live detection when the feed has gone quiet. */
export function isHotspotDataStale(dateIso: string): boolean {
  const ageDays = (Date.now() - new Date(dateIso).getTime()) / 86_400_000;
  return ageDays > 2;
}

export function trendArrow(delta: number): "up" | "down" | "flat" {
  if (delta > 0.5) return "up";
  if (delta < -0.5) return "down";
  return "flat";
}
