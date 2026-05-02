import districts from "@/data/districts.json";
import Link from "next/link";

export default async function DistrictPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const index = Number(id);
  const district = districts[index];

  if (!district) {
    return <div className="rounded-xl border p-4">ไม่พบข้อมูลอำเภอ</div>;
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">{district.district}</h1>
      <p className="text-slate-600">จังหวัด {district.province}</p>
      <p className="text-sm">พิกัด: {district.lat}, {district.lon}</p>
      <Link href="/dashboard" className="text-sm text-sky-600 underline">กลับไปยัง Dashboard</Link>
    </section>
  );
}
