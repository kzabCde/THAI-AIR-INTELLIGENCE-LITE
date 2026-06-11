import type { NextRequest } from "next/server";
import { handle, fail, ok } from "@/lib/api-response";
import { getProvince, isValidProvinceId } from "@/lib/isan";
import {
  getLatestWeather,
  getLatestWeatherByProvince,
  getWeatherHistory,
} from "@/services/weather.service";

export const revalidate = 0;

// GET /api/weather                 → latest weather for all provinces
// GET /api/weather?province=TH-40  → latest weather for one province
// GET /api/weather?province=TH-40&hours=48 → hourly weather history
export async function GET(req: NextRequest) {
  return handle(async () => {
    const province = req.nextUrl.searchParams.get("province");
    const hoursParam = req.nextUrl.searchParams.get("hours");

    if (province) {
      if (!isValidProvinceId(province)) return fail("Unknown Isan province", 404);
      const id = getProvince(province)!.id;
      if (hoursParam) {
        const hours = Math.min(2160, Math.max(1, Number(hoursParam) || 24));
        return ok({ provinceId: id, hours, history: await getWeatherHistory(id, hours) }, 120, 300);
      }
      return ok(await getLatestWeather(id), 120, 300);
    }

    const map = await getLatestWeatherByProvince();
    return ok(Object.fromEntries(map), 120, 300);
  });
}
