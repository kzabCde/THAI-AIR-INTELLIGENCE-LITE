import { format } from "date-fns";

export function thaiDateTimeLabel(date: Date) {
  return `${format(date, "HH:mm:ss")} น.`;
}
