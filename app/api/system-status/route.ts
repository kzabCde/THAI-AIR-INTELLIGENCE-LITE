import { handle, ok } from "@/lib/api-response";
import { getCronLogs, getDataFreshness, getModelStatuses, getModelActivations, getSyncJobs } from "@/services/system.service";

export const revalidate = 0;
export const dynamic = "force-dynamic";

// GET /api/system-status → pipeline sync state, cron logs, data freshness.
export async function GET() {
  return handle(async () => {
    const [jobs, cronLogs, freshness, models, activations] = await Promise.all([
      getSyncJobs(),
      getCronLogs(10),
      getDataFreshness(),
      getModelStatuses(),
      getModelActivations(),
    ]);
    return ok({ jobs, cronLogs, freshness, models, activations }, 0, 0);
  });
}
