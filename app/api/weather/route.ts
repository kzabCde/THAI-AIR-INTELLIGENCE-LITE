import { NextRequest, NextResponse } from "next/server";
import { FALLBACK_WEATHER, getWeather } from "@/lib/apis/weather";

export const revalidate = 0;

type WeatherPayload = {
  updatedAt: string;
  data: Awaited<ReturnType<typeof getWeather>>;
  fallback?: boolean;
};

let cachedWeather = new Map<string, WeatherPayload>();

export async function GET(request: NextRequest) {
  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lng = Number(request.nextUrl.searchParams.get("lng"));

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return NextResponse.json({ error: "กรุณาระบุ lat และ lng" }, { status: 400 });
  }

  const key = `${lat.toFixed(4)}:${lng.toFixed(4)}`;

  try {
    const data = await getWeather(lat, lng);
    const payload: WeatherPayload = { updatedAt: new Date().toISOString(), data };
    cachedWeather.set(key, payload);

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch {
    const cached = cachedWeather.get(key);
    if (cached) {
      return NextResponse.json({ ...cached, fallback: true });
    }
    return NextResponse.json({ updatedAt: new Date().toISOString(), data: FALLBACK_WEATHER, fallback: true });
  }
}
