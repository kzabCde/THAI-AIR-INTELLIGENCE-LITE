import "server-only";

import { getServiceSupabase, isSupabaseConfigured } from "./_db";
import { generateAndStoreForecasts } from "./forecast.service";

type SyncResult = { job: string; status: "success" | "error"; records: number; message?: string };

async function markStart(job: string) {
  if (!isSupabaseConfigured) return;
  await getServiceSupabase()
    .from("sync_state")
    .upsert(
      { job_name: job, status: "running", last_run_at: new Date().toISOString() },
      { onConflict: "job_name" },
    );
}

async function markDone(job: string, records: number, durationMs: number, error?: string) {
  if (!isSupabaseConfigured) return;
  const now = new Date().toISOString();
  await getServiceSupabase()
    .from("sync_state")
    .upsert(
      {
        job_name: job,
        status: error ? "error" : "success",
        last_run_at: now,
        ...(error ? {} : { last_success_at: now }),
        records_processed: records,
        duration_ms: durationMs,
        error_msg: error ?? null,
        updated_at: now,
      },
      { onConflict: "job_name" },
    );
}

/** Incremental "sync" for an hourly source: advances the cursor + record count. */
async function runHourlySync(
  job: string,
  table: "air_quality_hourly" | "weather_hourly",
): Promise<SyncResult> {
  const started = Date.now();
  await markStart(job);
  try {
    if (!isSupabaseConfigured) throw new Error("Supabase not configured");
    const sb = getServiceSupabase();
    const { data: latest } = await sb
      .from(table)
      .select("observed_at")
      .order("observed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const cursor = latest?.observed_at ?? null;
    const sinceIso = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await sb
      .from(table)
      .select("*", { count: "exact", head: true })
      .gte("created_at", sinceIso);
    const records = count ?? 0;
    await getServiceSupabase()
      .from("sync_state")
      .upsert({ job_name: job, cursor_at: cursor }, { onConflict: "job_name" });
    await markDone(job, records, Date.now() - started);
    return { job, status: "success", records };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await markDone(job, 0, Date.now() - started, msg);
    return { job, status: "error", records: 0, message: msg };
  }
}

export const runPm25Sync = () => runHourlySync("pm25_sync", "air_quality_hourly");
export const runWeatherSync = () => runHourlySync("weather_sync", "weather_hourly");

export async function runHotspotSync(): Promise<SyncResult> {
  const started = Date.now();
  await markStart("hotspot_sync");
  try {
    if (!isSupabaseConfigured) throw new Error("Supabase not configured");
    const sb = getServiceSupabase();
    const { count } = await sb
      .from("hotspot_daily")
      .select("*", { count: "exact", head: true })
      .gte("created_at", new Date(Date.now() - 6 * 3600_000).toISOString());
    await markDone("hotspot_sync", count ?? 0, Date.now() - started);
    return { job: "hotspot_sync", status: "success", records: count ?? 0 };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await markDone("hotspot_sync", 0, Date.now() - started, msg);
    return { job: "hotspot_sync", status: "error", records: 0, message: msg };
  }
}

/** Daily cleanup: delegates to the DB `run_data_cleanup()` routine + logs it. */
export async function runCleanup(): Promise<SyncResult> {
  const started = Date.now();
  await markStart("daily_cleanup");
  try {
    if (!isSupabaseConfigured) throw new Error("Supabase not configured");
    const sb = getServiceSupabase();
    const { data, error } = await sb.rpc("run_data_cleanup");
    if (error) throw error;
    await sb.from("cleanup_logs").insert({
      table_name: "all",
      rows_deleted: 0,
      status: "success",
      duration_ms: Date.now() - started,
      error_msg: typeof data === "string" ? data.slice(0, 500) : null,
    });
    await markDone("daily_cleanup", 0, Date.now() - started);
    return { job: "daily_cleanup", status: "success", records: 0, message: String(data ?? "") };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await getServiceSupabase()
      .from("cleanup_logs")
      .insert({ table_name: "all", rows_deleted: 0, status: "error", error_msg: msg });
    await markDone("daily_cleanup", 0, Date.now() - started, msg);
    return { job: "daily_cleanup", status: "error", records: 0, message: msg };
  }
}

/** Model retrain step → regenerate & persist forecasts for all provinces. */
export async function runRetrainAndForecast(): Promise<SyncResult> {
  const started = Date.now();
  await markStart("model_retrain");
  await markStart("forecast_generate");
  try {
    const records = await generateAndStoreForecasts();
    const dur = Date.now() - started;
    await markDone("model_retrain", records, dur);
    await markDone("forecast_generate", records, dur);
    return { job: "model_retrain", status: "success", records };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await markDone("model_retrain", 0, Date.now() - started, msg);
    await markDone("forecast_generate", 0, Date.now() - started, msg);
    return { job: "model_retrain", status: "error", records: 0, message: msg };
  }
}
