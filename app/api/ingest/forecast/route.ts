import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { runRetrainAndForecast } from "@/services/sync.service";
import { authorized } from "../_auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!authorized(req)) return fail("Unauthorized", 401);
  try {
    const result = await runRetrainAndForecast();
    return ok(result, 0, 0);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    console.error("[ingest/forecast]", message);
    return fail(message, 500);
  }
}
