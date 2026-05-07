import { notFound } from "next/navigation";
import { ProvinceDetailPage } from "@/components/province/province-detail-page";
import { generateMockAirQualityData } from "@/lib/mock/air-quality";
import { getAllProvinces } from "@/lib/provinces";

export default async function ProvinceIdPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const provinces = getAllProvinces();
  const idx = provinces.findIndex((p) => p.id.toLowerCase() === id.toLowerCase());
  if (idx === -1) notFound();

  const province = provinces[idx];
  const current = generateMockAirQualityData().find((row) => row.province.id === province.id);
  if (!current) {
    return <div className="rounded-2xl border p-8 text-center text-slate-500">ข้อมูลจังหวัดนี้ยังไม่พร้อมใช้งาน (Demo Unavailable)</div>;
  }

  return (
    <ProvinceDetailPage
      province={province}
      current={current}
      previousProvince={idx > 0 ? provinces[idx - 1] : undefined}
      nextProvince={idx < provinces.length - 1 ? provinces[idx + 1] : undefined}
    />
  );
}
