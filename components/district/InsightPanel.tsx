import { NormalizedAirQuality } from "@/services/apiService";

export function InsightPanel({ data }: { data: NormalizedAirQuality | null }) {
  if (!data) return null;
  const { pm25, factors } = data;
  const reasons = [
    factors.wind < 2 ? "ลมอ่อนทำให้การกระจายตัวฝุ่นต่ำ" : "",
    factors.humidity > 70 ? "ความชื้นสูงช่วยให้ฝุ่นเกาะตัว" : "",
    factors.hotspot > 20 ? "พบ hotspot สูงในพื้นที่ใกล้เคียง" : "",
  ].filter(Boolean);
  return <div className="rounded-xl border p-4"><h3 className="font-semibold">AI Insight</h3><p className="mt-2 text-sm">PM2.5 {pm25.toFixed(1)} µg/m³: {reasons.join(" + ") || "คุณภาพอากาศทรงตัว ไม่มีปัจจัยเสี่ยงเด่น"}</p></div>;
}
