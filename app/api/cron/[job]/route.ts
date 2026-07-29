import type { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api-response";
import { isProduction, verifyBearerSecret } from "@/lib/server-auth";
import {
  runCleanup,
  runHotspotSync,
  runMlForecast,
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
  "ml-forecast": runMlForecast,
} as const;

type JobKey = keyof typeof JOBS;

function authorized(req: NextRequest): boolean {
  return verifyBearerSecret(req.headers, process.env.CRON_SECRET);
}

function validateJob(job: string): JobKey | null {
  if (!/^[a-z0-9-]+$/.test(job)) return null;
  return job in JOBS ? (job as JobKey) : null;
}

// POST/GET /api/cron/<job> — invoked by Vercel Cron on a schedule.
export async function GET(req: NextRequest, ctx: { params: Promise<{ job: string }> }) {
  if (isProduction() && !process.env.CRON_SECRET) {
    return fail("CRON_SECRET is required in production", 503);
  }
  if (!authorized(req)) return fail("Unauthorized", 401);
  const { job } = await ctx.params;
  const validJob = validateJob(job);
  if (!validJob) return fail("Unknown cron job", 404);
  try {
    const result = await JOBS[validJob]();
    if (result.status === "error") {
      console.error(
        `[cron:${validJob}] failed`,
        result.message ?? "Scheduled job returned an error status",
      );
      return fail("Cron job failed", 500);
    }
    return ok(result, 0, 0);
  } catch (error) {
    console.error(`[cron:${validJob}] failed`, error);
    return fail("Cron job failed", 500);
  }
}

export const POST = GET;
