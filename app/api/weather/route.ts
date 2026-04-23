import { NextRequest, NextResponse } from "next/server";
import { getWeather } from "@/lib/apis/weather";

export const revalidate = 0;

export async function GET(request: NextRequest) {
  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lng = Number(request.nextUrl.searchParams.get("lng"));

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return NextResponse.json({ error: "กรุณาระบุ lat และ lng" }, { status: 400 });
  }

  const data = await getWeather(lat, lng);
  return NextResponse.json({ updatedAt: new Date().toISOString(), data });
}
