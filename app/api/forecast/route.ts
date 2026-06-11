import type { NextRequest } from "next/server";
import { handle, fail, ok } from "@/lib/api-response";
import { getProvince, isValidProvinceId } from "@/lib/isan";
import { getProvinceForecast } from "@/services/forecast.service";

export const revalidate = 0;

// GET /api/forecast?province=TH-30 → 168h hourly + 7d daily PM2.5 forecast.
export async function GET(req: NextRequest) {
  return handle(async () => {
    const province = req.nextUrl.searchParams.get("province") ?? "TH-30";
    if (!isValidProvinceId(province)) return fail("Unknown Isan province", 404);
    const id = getProvince(province)!.id;
    return ok(await getProvinceForecast(id), 300, 600);
  });
}
