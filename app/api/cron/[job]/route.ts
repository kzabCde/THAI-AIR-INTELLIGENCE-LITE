import type { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api-response";
import {
  runCleanup,
  runHotspotSync,
  runPm25Sync,
  runRetrainAndForecast,
  runWeatherSync,
} from "@/services/sync.service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const JOBS = {
  "pm25-sync": runPm25Sync,
  "weather-sync": runWeatherSync,
  "hotspot-sync": runHotspotSync,
  cleanup: runCleanup,
  retrain: runRetrainAndForecast,
} as const;

type JobKey = keyof typeof JOBS;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured → allow (dev)
  const header = req.headers.get("authorization");
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
  return header === `Bearer ${secret}`;
}

// POST/GET /api/cron/<job> — invoked by an external scheduler (GitHub Actions, Railway, etc.).
// Protected by CRON_SECRET env var. See docs/SCHEDULER_SETUP.md for configuration examples.
export async function GET(req: NextRequest, ctx: { params: Promise<{ job: string }> }) {
  if (!authorized(req)) return fail("Unauthorized", 401);
  const { job } = await ctx.params;
  const runner = JOBS[job as JobKey];
  if (!runner) return fail(`Unknown cron job: ${job}`, 404);
  const result = await runner();
  return ok(result, 0, 0);
}

export const POST = GET;
