import { isNetworkRestrictedError } from "@/services/_db";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getRegionOverview } from "@/services/overview.service";
import { OverviewDashboard } from "@/components/overview/overview-dashboard";
import { NotConfiguredState, ErrorState, NetworkRestrictedState } from "@/components/ui/states";

export const revalidate = 300;

export default async function OverviewPage() {
  if (!isSupabaseConfigured) return <NotConfiguredState />;

  let overview;
  try {
    overview = await getRegionOverview();
  } catch (err) {
    if (isNetworkRestrictedError(err)) return <NetworkRestrictedState />;
    return <ErrorState description="ไม่สามารถเชื่อมต่อฐานข้อมูล Supabase ได้" />;
  }

  const initialProvinceId = overview.worst?.province.id ?? "TH-40";

  return (
    <OverviewDashboard
      overview={overview}
      initialProvinceId={initialProvinceId}
    />
  );
}
