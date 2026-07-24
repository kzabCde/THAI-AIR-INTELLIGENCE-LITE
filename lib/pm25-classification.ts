/** Shared PM2.5 five-class mapping used by API and frontend code. */

export const PM25_THRESHOLD_VERSION = "thai-pm25-5class-v1";
export type PM25ClassId = 1 | 2 | 3 | 4 | 5;

export type PM25ClassDefinition = {
  id: PM25ClassId;
  maxPm25: number;
  labelEn: string;
  labelTh: string;
  color: string;
  textClass: string;
  backgroundClass: string;
  healthMessageTh: string;
  actionTh: string;
};

export const PM25_CLASSES: readonly PM25ClassDefinition[] = [
  {
    id: 1,
    maxPm25: 15,
    labelEn: "Very Good",
    labelTh: "ดีมาก",
    color: "#16a34a",
    textClass: "text-emerald-700 dark:text-emerald-300",
    backgroundClass: "bg-emerald-500/10 border-emerald-500/30",
    healthMessageTh: "คุณภาพอากาศดีมาก",
    actionTh: "ทำกิจกรรมกลางแจ้งได้ตามปกติ",
  },
  {
    id: 2,
    maxPm25: 25,
    labelEn: "Good",
    labelTh: "ดี",
    color: "#84cc16",
    textClass: "text-lime-700 dark:text-lime-300",
    backgroundClass: "bg-lime-500/10 border-lime-500/30",
    healthMessageTh: "คุณภาพอากาศดี",
    actionTh: "ทำกิจกรรมกลางแจ้งได้ และติดตามค่าฝุ่นตามปกติ",
  },
  {
    id: 3,
    maxPm25: 37.5,
    labelEn: "Moderate",
    labelTh: "ปานกลาง",
    color: "#eab308",
    textClass: "text-yellow-700 dark:text-yellow-300",
    backgroundClass: "bg-yellow-500/10 border-yellow-500/30",
    healthMessageTh: "คุณภาพอากาศปานกลาง",
    actionTh: "กลุ่มเสี่ยงควรสังเกตอาการเมื่อทำกิจกรรมกลางแจ้ง",
  },
  {
    id: 4,
    maxPm25: 75,
    labelEn: "Increased Health Risk",
    labelTh: "เริ่มมีผลกระทบต่อสุขภาพ",
    color: "#f97316",
    textClass: "text-orange-700 dark:text-orange-300",
    backgroundClass: "bg-orange-500/10 border-orange-500/30",
    healthMessageTh: "เริ่มมีความเสี่ยงต่อสุขภาพ",
    actionTh: "ลดกิจกรรมกลางแจ้ง โดยเฉพาะเด็ก ผู้สูงอายุ และผู้มีโรคประจำตัว",
  },
  {
    id: 5,
    maxPm25: Number.POSITIVE_INFINITY,
    labelEn: "Serious Health Effects",
    labelTh: "มีผลกระทบต่อสุขภาพอย่างรุนแรง",
    color: "#dc2626",
    textClass: "text-red-700 dark:text-red-300",
    backgroundClass: "bg-red-500/10 border-red-500/30",
    healthMessageTh: "มีผลกระทบต่อสุขภาพอย่างรุนแรง",
    actionTh: "หลีกเลี่ยงกิจกรรมกลางแจ้งและติดตามคำแนะนำจากหน่วยงานสาธารณสุข",
  },
] as const;

export function pm25ClassForValue(pm25: number): PM25ClassId {
  if (!Number.isFinite(pm25) || pm25 < 0) {
    throw new RangeError("PM2.5 must be a finite non-negative number");
  }
  return (PM25_CLASSES.find((item) => pm25 <= item.maxPm25)?.id ?? 5) as PM25ClassId;
}

export function pm25ClassDefinition(classId: number): PM25ClassDefinition {
  const definition = PM25_CLASSES.find((item) => item.id === classId);
  if (!definition) throw new RangeError("PM2.5 class must be between 1 and 5");
  return definition;
}

export function normalizeClassProbabilities(
  raw: unknown,
): Record<PM25ClassId, number> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const values = ([1, 2, 3, 4, 5] as PM25ClassId[]).map((id) =>
    Number((raw as Record<string, unknown>)[String(id)]),
  );
  if (values.some((value) => !Number.isFinite(value) || value < 0)) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return null;
  return Object.fromEntries(
    values.map((value, index) => [index + 1, value / total]),
  ) as Record<PM25ClassId, number>;
}
