"use client";

import { Megaphone, ChevronRight } from "lucide-react";
import Link from "next/link";

export function AnnouncementBanner() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-red-500/30 bg-gradient-to-r from-red-500/10 via-amber-500/10 to-surface-1 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500 text-white shadow-soft">
            <Megaphone size={20} className="animate-bounce" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-red-600 dark:text-red-400 text-xs uppercase tracking-wider">
                ข่าว / ประกาศสำคัญ
              </span>
              <span className="muted text-[10px]">· 2 ชั่วโมงที่แล้ว</span>
            </div>
            <p className="text-sm font-semibold text-fg">
              PM2.5 มีแนวโน้มสูงขึ้นในบางพื้นที่ช่วงเย็นถึงค่ำ โปรดดูแลสุขภาพและสวมหน้ากากอนามัยเมื่อออกนอกอาคาร
            </p>
          </div>
        </div>

        <Link
          href="/forecast"
          className="inline-flex items-center gap-1 rounded-xl bg-surface-1 px-3 py-1.5 text-xs font-semibold text-fg shadow-xs transition hover:bg-surface-2"
        >
          ดูรายละเอียด
          <ChevronRight size={14} />
        </Link>
      </div>
    </div>
  );
}
