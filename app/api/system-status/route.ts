import { handle, ok } from "@/lib/api-response";
import { getCronLogs, getDataFreshness, getSyncJobs } from "@/services/system.service";

export const revalidate = 0;

// GET /api/system-status → pipeline sync state, cron logs, data freshness.
export async function GET() {
  return handle(async () => {
    const [jobs, cronLogs, freshness] = await Promise.all([
      getSyncJobs(),
      getCronLogs(10),
      getDataFreshness(),
    ]);
    return ok({ jobs, cronLogs, freshness }, 60, 120);
  });
}
