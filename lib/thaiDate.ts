export function thaiDateTimeLabel(date: Date) {
  return new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(date) + " น.";
}

export function formatThaiBuddhistDate(date: Date) {
  return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function formatThaiBuddhistDateTime(date: Date) {
  return `${formatThaiBuddhistDate(date)} ${thaiDateTimeLabel(date)}`;
}
