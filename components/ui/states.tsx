import { AlertTriangle, Inbox, Lock, WifiOff } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  title = "ไม่มีข้อมูล",
  description = "ยังไม่มีข้อมูลสำหรับมุมมองนี้",
  icon,
}: {
  title?: string;
  description?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 py-12 text-center">
      <div className="muted mb-3">{icon ?? <Inbox size={36} strokeWidth={1.5} />}</div>
      <p className="font-semibold">{title}</p>
      <p className="muted mt-1 max-w-sm text-sm">{description}</p>
    </div>
  );
}

export function ErrorState({
  title = "เกิดข้อผิดพลาด",
  description = "ไม่สามารถโหลดข้อมูลได้ในขณะนี้",
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/5 px-6 py-12 text-center">
      <div className="mb-3 text-red-500">
        <AlertTriangle size={36} strokeWidth={1.5} />
      </div>
      <p className="font-semibold text-red-600 dark:text-red-300">{title}</p>
      <p className="muted mt-1 max-w-sm text-sm">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function NotConfiguredState() {
  return (
    <ErrorState
      title="ยังไม่ได้เชื่อมต่อฐานข้อมูล"
      description="ตั้งค่า NEXT_PUBLIC_SUPABASE_URL และ NEXT_PUBLIC_SUPABASE_ANON_KEY เพื่อแสดงข้อมูลจริงจาก Supabase"
    />
  );
}

export function OfflineState() {
  return (
    <ErrorState
      title="ออฟไลน์"
      description="การเชื่อมต่อขัดข้อง โปรดลองอีกครั้ง"
      action={<WifiOff className="muted mx-auto" />}
    />
  );
}

export function NetworkRestrictedState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/5 px-6 py-12 text-center">
      <div className="mb-3 text-amber-500">
        <Lock size={36} strokeWidth={1.5} />
      </div>
      <p className="font-semibold text-amber-600 dark:text-amber-300">Supabase Network Restrictions</p>
      <p className="muted mt-2 max-w-md text-sm">
        Supabase บล็อก API requests จาก host นี้ กรุณาไปที่ Supabase Dashboard แล้วปิด Network Restrictions
      </p>
      <div className="mt-4 rounded-lg bg-surface-2 px-4 py-3 text-left text-xs">
        <p className="font-semibold">วิธีแก้ไข:</p>
        <ol className="muted mt-1 list-decimal pl-4 space-y-1">
          <li>ไปที่ Supabase Dashboard → Project Settings</li>
          <li>เลือก <strong>Networking</strong> → <strong>Network Restrictions</strong></li>
          <li>ลบ restriction ออก หรือเพิ่ม <code className="text-xs bg-surface-1 px-1 rounded">0.0.0.0/0</code> เพื่อ allow ทุก IP</li>
          <li>กด Save แล้ว reload หน้านี้</li>
        </ol>
      </div>
    </div>
  );
}
