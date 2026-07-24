import { handle, ok } from "@/lib/api-response";
import { getCronLogs, getDataFreshness, getModelMetrics, getSyncJobs } from "@/services/system.service";

export const revalidate = 0;

// GET /api/system-status → pipeline sync state, cron logs, data freshness.
export async function GET() {
  return handle(async () => {
    const [jobs, cronLogs, freshness, models] = await Promise.all([
      getSyncJobs(),
      getCronLogs(10),
      getDataFreshness(),
      getModelMetrics(),
    ]);
    return ok({ jobs, cronLogs, freshness, models }, 60, 120);
  });
}
