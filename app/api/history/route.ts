import type { NextRequest } from "next/server";
import { handle, fail, ok } from "@/lib/api-response";
import { getProvince, isValidProvinceId } from "@/lib/isan";
import { getDailyHistory } from "@/services/daily-summary.service";

export const revalidate = 0;

// GET /api/history?province=TH-40&days=30 → daily summary history (7/30/90 …).
export async function GET(req: NextRequest) {
  return handle(async () => {
    const province = req.nextUrl.searchParams.get("province");
    if (!province || !isValidProvinceId(province)) return fail("province is required", 400);
    const id = getProvince(province)!.id;
    const days = Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get("days")) || 30));
    return ok({ provinceId: id, days, history: await getDailyHistory(id, days) }, 300, 600);
  });
}
