import "server-only";

import { getServiceSupabase, isSupabaseConfigured } from "./_db";

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

/** Daily cleanup: delegates to the DB `fn_cleanup_old_data()` routine + logs it.
 *  Retention matches pg_cron: 18 mo for raw measurements, 90 d for forecasts.
 */
export async function runCleanup(): Promise<SyncResult> {
  const started = Date.now();
  await markStart("daily_cleanup");
  try {
    if (!isSupabaseConfigured) throw new Error("Supabase not configured");
    const sb = getServiceSupabase();
    const { data, error } = await sb.rpc("fn_cleanup_old_data");
    if (error) throw error;
    const dur = Date.now() - started;
    await sb.from("cron_log").insert({
      job_name: "daily_cleanup",
      started_at: new Date(started).toISOString(),
      finished_at: new Date().toISOString(),
      status: "success",
      duration_ms: dur,
      meta: data as import("@/lib/supabase/database.types").Json,
    });
    await markDone("daily_cleanup", 0, dur);
    return { job: "daily_cleanup", status: "success", records: 0, message: JSON.stringify(data) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await getServiceSupabase().from("cron_log").insert({
      job_name: "daily_cleanup",
      started_at: new Date(started).toISOString(),
      finished_at: new Date().toISOString(),
      status: "error",
      duration_ms: Date.now() - started,
      error_msg: msg,
    });
    await markDone("daily_cleanup", 0, Date.now() - started, msg);
    return { job: "daily_cleanup", status: "error", records: 0, message: msg };
  }
}

/** Model retrain step → delegates to DB `fn_generate_forecast(7)`.
 *  Uses the same model (persist-revert-v2) and writes to model_registry,
 *  keeping the DB as the single source of truth for forecast generation.
 */
export async function runRetrainAndForecast(): Promise<SyncResult> {
  const started = Date.now();
  await markStart("model_retrain");
  await markStart("forecast_generate");
  try {
    if (!isSupabaseConfigured) throw new Error("Supabase not configured");
    const sb = getServiceSupabase();
    const { data, error } = await sb.rpc("fn_generate_forecast", { p_horizon: 7 });
    if (error) throw error;
    const records = typeof data === "number" ? data : 0;
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
