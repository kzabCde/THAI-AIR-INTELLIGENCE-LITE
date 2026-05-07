import { PagePlaceholder } from "@/components/layout/page-placeholder";
export default async function ProvinceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PagePlaceholder title={`จังหวัด: ${decodeURIComponent(id)}`} subtitle="รายละเอียดจังหวัด, แนวโน้ม, และความเสี่ยงรายพื้นที่" />;
}
