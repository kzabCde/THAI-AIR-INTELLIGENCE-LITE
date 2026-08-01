import "server-only";

import { getServiceSupabase, isSupabaseConfigured } from "./_db";
import type { CronLog, DataFreshness, ModelStatus, SyncJob } from "./types";

export async function getSyncJobs(): Promise<SyncJob[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await getServiceSupabase()
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
  const { data, error } = await getServiceSupabase()
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

/** Active serving model plus the latest candidate for each province/task. */
export async function getModelStatuses(): Promise<ModelStatus[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await getServiceSupabase()
    .from("model_registry")
    .select(
      "model_name,province_id,task_type,run_id,trained_at,eligibility_status,eligibility_reason,is_active,model_version,evidence_status,serving_model_family,feature_version",
    )
    .order("province_id", { ascending: true })
    .order("task_type", { ascending: true })
    .order("trained_at", { ascending: false });
  if (error) throw error;

  const groups = new Map<string, typeof data>();
  for (const row of data ?? []) {
    if (
      !row.province_id
      || (row.task_type !== "regression" && row.task_type !== "classification")
    ) continue;
    const key = `${row.province_id}:${row.task_type}`;
    const rows = groups.get(key) ?? [];
    rows.push(row);
    groups.set(key, rows);
  }

  return [...groups.values()].flatMap((rows) => {
    const latest = rows[0];
    if (!latest?.province_id) return [];
    const active = rows.find((row) => row.is_active === true) ?? null;
    const usesMeanFallback = latest.task_type === "regression"
      && (!active || active.model_name === "persist-revert-v2");
    const serving = usesMeanFallback ? null : active;
    const lifecycle = (row: typeof active): ModelStatus["activeLifecycle"] => {
      if (!row) return "fallback";
      return row.model_version === "pooled-dual-pm25-v1"
        && row.evidence_status === "validated"
        && row.eligibility_status === true
        ? "validated"
        : "legacy";
    };
    return [{
      provinceId: latest.province_id,
      taskType: latest.task_type as "regression" | "classification",
      activeModelName: usesMeanFallback
        ? "recent-mean-v1"
        : (serving?.model_name ?? null),
      activeRunId: serving?.run_id ?? null,
      activeTrainedAt: serving?.trained_at ?? null,
      activeEligible: serving?.eligibility_status === true,
      activeLifecycle: usesMeanFallback ? "fallback" : lifecycle(serving),
      activeServingFamily: usesMeanFallback
        ? "arithmetic_mean"
        : (serving?.serving_model_family ?? null),
      activeFeatureVersion: serving?.feature_version ?? null,
      latestModelName: latest.model_name,
      latestRunId: latest.run_id,
      latestTrainedAt: latest.trained_at,
      latestEligible: latest.eligibility_status === true,
      latestIsActive: latest.is_active === true,
      latestEligibilityReason: latest.eligibility_reason,
      latestLifecycle: lifecycle(latest),
    }];
  });
}

/** Latest timestamp + row count for each core data table. */
export async function getDataFreshness(): Promise<DataFreshness[]> {
  if (!isSupabaseConfigured) return [];
  const sb = getServiceSupabase();

  async function freshness(
    table: "air_quality_hourly" | "weather_hourly" | "hotspot_daily" | "daily_summary",
    timeCol: "observed_at" | "date",
  ): Promise<DataFreshness> {
    const [{ data: latest }, { count }] = await Promise.all([
      sb.from(table).select(timeCol).order(timeCol, { ascending: false }).limit(1).maybeSingle(),
      // Operational status only needs an approximate row count. Estimated
      // counts avoid full scans of the 250k+ hourly tables on every page load.
      sb.from(table).select("*", { count: "estimated", head: true }),
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
