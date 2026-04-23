import Link from "next/link";

export default function ProvinceNotFound() {
  return (
    <section className="rounded-2xl border p-6 text-center">
      <h1 className="text-2xl font-bold">ไม่พบจังหวัดที่ต้องการ</h1>
      <p className="mt-2 text-slate-600">รองรับ slug เช่น bangkok, chiang-mai, nonthaburi และจังหวัดอื่นในประเทศไทย</p>
      <Link href="/map" className="mt-4 inline-block rounded-lg bg-sky-600 px-4 py-2 text-white">กลับไปหน้าแผนที่</Link>
    </section>
  );
}
