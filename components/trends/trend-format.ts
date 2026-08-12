export const RANGE_OPTIONS = [
  { days: 7, label: "7 วัน" },
  { days: 30, label: "30 วัน" },
  { days: 90, label: "90 วัน" },
  { days: 180, label: "6 เดือน" },
  { days: 365, label: "1 ปี" },
] as const;

export const PM25_LEGEND = ["0–15", ">15–25", ">25–37.5", ">37.5–75", ">75"];

export function parseDateKey(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

export function formatTrendDate(date: string | null, includeYear = false): string {
  if (!date) return "-";
  return parseDateKey(date).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: includeYear ? "2-digit" : undefined,
    timeZone: "UTC",
  });
}

export function formatTrendRange(from: string | null, to: string | null): string {
  if (!from || !to) return "ยังไม่มีช่วงข้อมูล";
  return `${formatTrendDate(from, true)} – ${formatTrendDate(to, true)}`;
}

export function formatTrendObservedAt(value: string | null): string {
  if (!value) return "ไม่ทราบเวลาอัปเดต";
  return new Date(value).toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  });
}

export function formatTrendMonth(month: string): string {
  return parseDateKey(`${month}-01`).toLocaleDateString("th-TH", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

export function signedTrendValue(value: number | null, suffix = ""): string {
  if (value == null) return "-";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}${suffix}`;
}
