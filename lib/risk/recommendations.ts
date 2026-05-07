import { type RiskLevelKey } from "@/lib/risk/types";

export const RISK_COPY: Record<RiskLevelKey, { thaiLabel: string; englishLabel: string; recommendations: string[]; outdoorAdvice: string }> = {
  low: { thaiLabel: "ต่ำ", englishLabel: "Low", recommendations: ["ใช้ชีวิตประจำวันได้ตามปกติ", "ติดตามค่าคุณภาพอากาศวันละ 1-2 ครั้ง"], outdoorAdvice: "ทำกิจกรรมกลางแจ้งได้ตามปกติ" },
  moderate: { thaiLabel: "ปานกลาง", englishLabel: "Moderate", recommendations: ["กลุ่มเสี่ยงควรเตรียมหน้ากาก", "หลีกเลี่ยงพื้นที่จราจรหนาแน่น"], outdoorAdvice: "ทำกิจกรรมกลางแจ้งได้ แต่ควรเฝ้าระวัง" },
  sensitive: { thaiLabel: "เริ่มกระทบกลุ่มเสี่ยง", englishLabel: "Sensitive", recommendations: ["กลุ่มเสี่ยงลดเวลานอกอาคาร", "สวมหน้ากากกรองฝุ่นเมื่ออยู่นอกอาคาร"], outdoorAdvice: "ลดกิจกรรมกลางแจ้งระยะยาว" },
  high: { thaiLabel: "สูง", englishLabel: "High", recommendations: ["จำกัดกิจกรรมกลางแจ้ง", "ใช้เครื่องฟอกอากาศในอาคาร"], outdoorAdvice: "ควรหลีกเลี่ยงกิจกรรมกลางแจ้ง" },
  severe: { thaiLabel: "รุนแรง", englishLabel: "Severe", recommendations: ["อยู่ในอาคารให้มากที่สุด", "สวมหน้ากาก N95 หากจำเป็นต้องออกนอกอาคาร"], outdoorAdvice: "หลีกเลี่ยงกิจกรรมกลางแจ้งทั้งหมด" },
};

export const SENSITIVE_GROUPS = ["เด็ก", "ผู้สูงอายุ", "หญิงตั้งครรภ์", "ผู้ป่วยโรคหอบหืด/หัวใจ/ปอด"];
