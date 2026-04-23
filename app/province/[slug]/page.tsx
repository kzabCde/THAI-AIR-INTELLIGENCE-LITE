import { notFound } from "next/navigation";
import { ProvinceDetailClient } from "@/components/province/province-detail-client";
import { THAILAND_PROVINCE_MAP } from "@/lib/provinces";

export default async function ProvinceDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  if (!THAILAND_PROVINCE_MAP[slug]) {
    notFound();
  }

  return <ProvinceDetailClient slug={slug} />;
}
