import Link from "next/link";
import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center justify-center py-20 text-center">
      <div className="rounded-full bg-amber-100 p-4 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300">
        <AlertCircle size={32} />
      </div>
      <h2 className="mt-4 text-xl font-black text-zinc-900 dark:text-white">ไม่พบหน้าที่คุณต้องการ</h2>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        หน้านี้อาจถูกย้าย ลบออก หรือที่อยู่ URL ไม่ถูกต้อง
      </p>
      <Link
        href="/"
        className="mt-6 rounded-full bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700"
      >
        กลับหน้าหลัก
      </Link>
    </div>
  );
}
