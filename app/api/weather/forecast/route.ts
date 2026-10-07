import type { NextRequest } from "next/server";
import { handle, fail, ok } from "@/lib/api-response";
import { getProvince, isValidProvinceId } from "@/lib/isan";
import { getHourlyWeatherForecast } from "@/services/weather-forecast.service";

export const revalidate = 0;

// GET /api/weather/forecast?province=TH-32 → real hourly weather forecast
// (temperature, humidity, rain probability/amount, wind) for the next 7 days.
export async function GET(req: NextRequest) {
  return handle(async () => {
    const province = req.nextUrl.searchParams.get("province");
    if (!province || !isValidProvinceId(province)) return fail("Unknown Isan province", 404);
    const forecast = await getHourlyWeatherForecast(getProvince(province)!.id);
    // Don't let a CDN pin an empty (upstream-failure) response for long.
    return forecast.points.length ? ok(forecast, 900, 1800) : ok(forecast, 30, 60);
  });
}
