import Link from "next/link";
import { EmptyState } from "@/components/ui/states";

export default function ProvinceNotFound() {
  return (
    <div className="space-y-4">
      <EmptyState
        title="ไม่พบจังหวัด"
        description="จังหวัดนี้ไม่อยู่ในพื้นที่ภาคอีสาน 20 จังหวัด"
      />
      <div className="text-center">
        <Link href="/" className="text-sm font-semibold text-brand hover:underline">
          ← กลับสู่ภาพรวม
        </Link>
      </div>
    </div>
  );
}
