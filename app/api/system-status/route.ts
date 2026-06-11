import { handle, ok } from "@/lib/api-response";
import { getCleanupLogs, getDataFreshness, getSyncJobs } from "@/services/system.service";

export const revalidate = 0;

// GET /api/system-status → pipeline sync state, cleanup logs, data freshness.
export async function GET() {
  return handle(async () => {
    const [jobs, cleanup, freshness] = await Promise.all([
      getSyncJobs(),
      getCleanupLogs(10),
      getDataFreshness(),
    ]);
    return ok({ jobs, cleanup, freshness }, 60, 120);
  });
}
