import { NextRequest, NextResponse } from "next/server";
import { generateHistoricalData, getProvinceHistory } from "@/lib/historical-generator";
import { THAILAND_PROVINCE_MAP } from "@/lib/thailand-provinces";

export const revalidate = 0;

const cache = new Map<string, { data: unknown; expiresAt: number }>();
const TTL = 10 * 60 * 1000;

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug");
  const days = Math.min(30, Math.max(1, Number(request.nextUrl.searchParams.get("days") ?? 7)));

  const key = `${slug ?? "all"}:${days}`;
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    return NextResponse.json(cached.data, { headers: { "Cache-Control": "public, s-maxage=300" } });
  }

  if (slug) {
    if (!THAILAND_PROVINCE_MAP[slug]) {
      return NextResponse.json({ error: "Province not found" }, { status: 404 });
    }
    const history = getProvinceHistory(slug, days);
    const province = THAILAND_PROVINCE_MAP[slug];
    const payload = {
      slug,
      province_name_th: province.province_name_th,
      province_name_en: province.province_name_en,
      days,
      history,
    };
    cache.set(key, { data: payload, expiresAt: now + TTL });
    return NextResponse.json(payload);
  }

  const allHistory = generateHistoricalData(days);
  const payload = { days, count: allHistory.length, history: allHistory };
  cache.set(key, { data: payload, expiresAt: now + TTL });
  return NextResponse.json(payload);
}
