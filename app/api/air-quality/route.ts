import type { NextRequest } from "next/server";
import { handle, fail, ok } from "@/lib/api-response";
import { isValidProvinceId, getProvince } from "@/lib/isan";
import { getAirHistory, getLatestAir } from "@/services/air-quality.service";
import { getRegionOverview } from "@/services/overview.service";

export const revalidate = 0;

// GET /api/air-quality            → latest snapshot for all 20 provinces
// GET /api/air-quality?province=TH-30        → latest reading for one province
// GET /api/air-quality?province=TH-30&hours=72 → hourly history
export async function GET(req: NextRequest) {
  return handle(async () => {
    const province = req.nextUrl.searchParams.get("province");
    const hoursParam = req.nextUrl.searchParams.get("hours");

    if (province) {
      if (!isValidProvinceId(province)) return fail("Unknown Isan province", 404);
      const id = getProvince(province)!.id;
      if (hoursParam) {
        const hours = Math.min(2160, Math.max(1, Number(hoursParam) || 24));
        return ok({ provinceId: id, hours, history: await getAirHistory(id, hours) }, 120, 300);
      }
      return ok(await getLatestAir(id), 60, 180);
    }

    const overview = await getRegionOverview();
    return ok(overview, 60, 180);
  });
}
