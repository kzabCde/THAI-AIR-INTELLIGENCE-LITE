import Image from "next/image";
import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mx-auto max-w-7xl px-4 pb-24 pt-8 text-xs text-zinc-500 dark:text-zinc-400 md:pb-8">
      <div className="border-t border-border pt-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl text-center md:text-left">
            <div className="flex items-center justify-center gap-2 md:justify-start">
              <Image
                src="/images/cloud-logo.png"
                alt="Isan Air Intelligence"
                width={28}
                height={28}
                className="h-7 w-7 object-contain"
              />
              <div>
                <p className="font-bold text-zinc-800 dark:text-zinc-200">THAI AIR INTELLIGENCE</p>
                <p className="muted text-[10px] font-medium tracking-wide">Isan Air Intelligence</p>
              </div>
            </div>
            <p className="mt-3 text-[11.5px] leading-5">
              ระบบติดตามและพยากรณ์ PM2.5 สำหรับ 20 จังหวัดภาคตะวันออกเฉียงเหนือ
            </p>
            <p className="mt-1 text-[11px] leading-5">
              พัฒนาโดยนักศึกษาสาขาวิชาคณิตศาสตร์–คอมพิวเตอร์ คณะวิทยาศาสตร์ประยุกต์ มจพ.
            </p>
          </div>

          <nav aria-label="ลิงก์ส่วนท้าย" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 md:justify-end">
            <Link
              href="/about"
              className="font-semibold text-zinc-600 transition hover:text-teal-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 dark:text-zinc-300 dark:hover:text-teal-400"
            >
              เกี่ยวกับโครงการ
            </Link>
            <Link
              href="/about#team"
              className="font-semibold text-zinc-600 transition hover:text-teal-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 dark:text-zinc-300 dark:hover:text-teal-400"
            >
              ทีมผู้พัฒนา
            </Link>
            <Link
              href="/system"
              className="inline-flex items-center gap-1.5 font-semibold text-zinc-600 transition hover:text-teal-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 dark:text-zinc-300 dark:hover:text-teal-400"
            >
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>สถานะระบบ ↗</span>
            </Link>
          </nav>
        </div>

        <div className="mt-5 flex flex-col items-center justify-between gap-1.5 border-t border-border pt-4 text-center text-[11px] sm:flex-row sm:text-left">
          <span>© 2026 THAI AIR INTELLIGENCE</span>
          <span className="muted">ข้อมูลคุณภาพอากาศ 20 จังหวัดภาคอีสาน</span>
        </div>
      </div>
    </footer>
  );
}
