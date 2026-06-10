import { NextRequest, NextResponse } from "next/server";
import { computeModelMetrics, selectBestModel } from "@/lib/ml-engine";
import { getProvinceHistory } from "@/lib/historical-generator";
import { THAILAND_PROVINCES } from "@/lib/thailand-provinces";

export const revalidate = 0;

let cached: { data: unknown; expiresAt: number } | null = null;
const TTL = 15 * 60 * 1000;

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug");
  const now = Date.now();

  if (slug) {
    const history = getProvinceHistory(slug, 30);
    const metrics = computeModelMetrics(history);
    const best = selectBestModel(metrics);
    return NextResponse.json({ slug, best_model: best, metrics });
  }

  if (cached && cached.expiresAt > now) {
    return NextResponse.json(cached.data, { headers: { "Cache-Control": "public, s-maxage=600" } });
  }

  // Compute metrics for sample provinces (one per region)
  const sampleSlugs = ["chiang-mai", "khon-kaen", "bangkok", "chonburi", "kanchanaburi", "phuket"];
  const provinceMetrics = sampleSlugs.map((slug) => {
    const province = THAILAND_PROVINCES.find((p) => p.slug === slug);
    if (!province) return null;
    const history = getProvinceHistory(slug, 30);
    const metrics = computeModelMetrics(history);
    const best = selectBestModel(metrics);
    return { slug, province_name_th: province.province_name_th, region: province.region, best_model: best, metrics };
  }).filter(Boolean);

  // Aggregate metrics across all provinces
  const history = getProvinceHistory("bangkok", 30);
  const globalMetrics = computeModelMetrics(history);

  const payload = {
    generated_at: new Date().toISOString(),
    global_best_model: selectBestModel(globalMetrics),
    global_metrics: globalMetrics,
    province_metrics: provinceMetrics,
  };

  cached = { data: payload, expiresAt: now + TTL };
  return NextResponse.json(payload, { headers: { "Cache-Control": "public, s-maxage=600" } });
}
