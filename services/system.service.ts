import "server-only";

import { getSupabase, isSupabaseConfigured } from "./_db";
import type { CronLog, DataFreshness, SyncJob } from "./types";

export async function getSyncJobs(): Promise<SyncJob[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await getSupabase()
    .from("sync_state")
    .select("*")
    .order("job_name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    jobName: r.job_name,
    source: r.source,
    schedule: r.schedule,
    status: r.status,
    lastRunAt: r.last_run_at,
    lastSuccessAt: r.last_success_at,
    recordsProcessed: r.records_processed,
    errorMsg: r.error_msg,
  }));
}

export async function getCronLogs(limit = 20): Promise<CronLog[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await getSupabase()
    .from("cron_log")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    jobName: r.job_name,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    status: r.status,
    durationMs: r.duration_ms,
    recordsIn: r.records_in,
    recordsOut: r.records_out,
    errorMsg: r.error_msg,
  }));
}

/** Latest timestamp + row count for each core data table. */
export async function getDataFreshness(): Promise<DataFreshness[]> {
  if (!isSupabaseConfigured) return [];
  const sb = getSupabase();

  async function freshness(
    table: "air_quality_hourly" | "weather_hourly" | "hotspot_daily" | "daily_summary",
    timeCol: "observed_at" | "date",
  ): Promise<DataFreshness> {
    const [{ data: latest }, { count }] = await Promise.all([
      sb.from(table).select(timeCol).order(timeCol, { ascending: false }).limit(1).maybeSingle(),
      sb.from(table).select("*", { count: "exact", head: true }),
    ]);
    const value = latest ? (latest as unknown as Record<string, string>)[timeCol] : null;
    return { table, latest: value ?? null, rowCount: count ?? null };
  }

  return Promise.all([
    freshness("air_quality_hourly", "observed_at"),
    freshness("weather_hourly", "observed_at"),
    freshness("hotspot_daily", "date"),
    freshness("daily_summary", "date"),
  ]);
}
