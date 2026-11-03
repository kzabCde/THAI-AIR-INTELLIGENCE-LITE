"use client";

import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[1100] flex items-center justify-center gap-2 bg-amber-500 px-4 pb-1.5 pt-[max(0.375rem,env(safe-area-inset-top))] text-xs font-semibold text-amber-950 shadow-sm"
    >
      <WifiOff size={14} />
      ออฟไลน์ — กำลังแสดงข้อมูลล่าสุดที่แคชไว้
    </div>
  );
}
