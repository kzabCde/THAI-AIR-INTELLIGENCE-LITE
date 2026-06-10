import { NextRequest, NextResponse } from "next/server";
import { generateForecast, computeModelMetrics, selectBestModel } from "@/lib/ml-engine";
import { getProvinceHistory } from "@/lib/historical-generator";
import { THAILAND_PROVINCE_MAP } from "@/lib/thailand-provinces";

export const revalidate = 0;

const cache = new Map<string, { data: unknown; expiresAt: number }>();
const TTL = 5 * 60 * 1000;

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug");
  const model = request.nextUrl.searchParams.get("model") as Parameters<typeof generateForecast>[1] ?? "Ensemble";
  const days = Math.min(14, Math.max(1, Number(request.nextUrl.searchParams.get("days") ?? 7)));

  if (slug && !THAILAND_PROVINCE_MAP[slug]) {
    return NextResponse.json({ error: "Province not found" }, { status: 404 });
  }

  const key = `${slug ?? "all"}:${model}:${days}`;
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    return NextResponse.json(cached.data, { headers: { "Cache-Control": "public, s-maxage=240, stale-while-revalidate=300" } });
  }

  if (slug) {
    const history = getProvinceHistory(slug, 30);
    const metrics = computeModelMetrics(history);
    const bestModel = metrics.length ? selectBestModel(metrics) : model;
    const forecast = generateForecast(history, bestModel, days);
    const province = THAILAND_PROVINCE_MAP[slug];
    const payload = {
      slug,
      province_name_th: province?.province_name_th,
      province_name_en: province?.province_name_en,
      model_used: bestModel,
      generated_at: new Date().toISOString(),
      forecast,
      metrics: metrics.slice(0, 5),
    };
    cache.set(key, { data: payload, expiresAt: now + TTL });
    return NextResponse.json(payload, { headers: { "Cache-Control": "public, s-maxage=240, stale-while-revalidate=300" } });
  }

  // All provinces summary forecast
  const { THAILAND_PROVINCES } = await import("@/lib/thailand-provinces");
  const summaries = THAILAND_PROVINCES.map((p) => {
    const history = getProvinceHistory(p.slug, 14);
    const forecast = generateForecast(history, "Ensemble", days);
    return {
      slug: p.slug,
      province_name_th: p.province_name_th,
      province_name_en: p.province_name_en,
      region: p.region,
      forecast,
    };
  });

  const payload = { generated_at: new Date().toISOString(), days, provinces: summaries };
  cache.set(key, { data: payload, expiresAt: now + TTL });
  return NextResponse.json(payload, { headers: { "Cache-Control": "public, s-maxage=240, stale-while-revalidate=300" } });
}
