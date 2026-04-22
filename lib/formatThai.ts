export function formatThaiDate(date: Date) {
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function formatThaiTime(date: Date) {
  return new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatThaiShortTime(date: Date) {
  return `${new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)} น.`;
}

export function levelThai(pm25: number) {
  if (pm25 <= 25) return { label: "ดีมาก", icon: "🟢" };
  if (pm25 <= 50) return { label: "ดี", icon: "🟡" };
  if (pm25 <= 75) return { label: "ปานกลาง", icon: "🟠" };
  if (pm25 <= 100) return { label: "เริ่มมีผลกระทบ", icon: "🔴" };
  if (pm25 <= 150) return { label: "อันตราย", icon: "🟣" };
  return { label: "วิกฤต", icon: "⚫" };
}
