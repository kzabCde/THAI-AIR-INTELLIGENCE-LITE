import type { NextRequest } from "next/server";
import { handle, fail, ok } from "@/lib/api-response";
import { isValidProvinceId } from "@/lib/isan";
import { getAnalytics } from "@/services/analytics.service";

export const revalidate = 0;

// GET /api/analytics?province=TH-30&from=2026-01-01&to=2026-06-01
export async function GET(req: NextRequest) {
  return handle(async () => {
    const sp = req.nextUrl.searchParams;
    const province = sp.get("province") ?? "all";
    if (province !== "all" && !isValidProvinceId(province)) {
      return fail("Unknown Isan province", 404);
    }
    const today = new Date().toISOString().slice(0, 10);
    const from = sp.get("from") ?? new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
    const to = sp.get("to") ?? today;
    if (from > to) return fail("'from' must be before 'to'", 400);
    return ok(await getAnalytics({ provinceId: province, from, to }), 300, 600);
  });
}
