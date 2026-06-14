import type { Metadata } from "next";
import { CheckCircle2, Clock, Database, XCircle, Timer, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { fmtNumber, fmtDateTimeTh } from "@/lib/format";
import { RelativeTime } from "@/components/ui/relative-time";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getCronLogs, getDataFreshness, getModelMetrics, getSyncJobs } from "@/services/system.service";
import { isNetworkRestrictedError } from "@/services/_db";
import { Section, CardHeader } from "@/components/ui/card";
import { NotConfiguredState, ErrorState, NetworkRestrictedState, EmptyState } from "@/components/ui/states";

export const metadata: Metadata = { title: "สถานะระบบ" };
export const revalidate = 300;

const MODEL_LABELS: Record<string, string> = {
  "persist-revert-v2": "Persistence + Mean-Revert (ค่า 7 วันย้อนหลัง)",
  "ewma-diurnal-v1": "EWMA + Diurnal Curve",
  "weighted-ensemble-v1": "Weighted Ensemble (เลิกใช้)",
};

const JOB_LABELS: Record<string, string> = {
  pm25_sync: "ซิงค์ PM2.5 (รายชั่วโมง)",
  weather_sync: "ซิงค์สภาพอากาศ (รายชั่วโมง)",
  hotspot_sync: "ซิงค์จุดความร้อน (ทุก 6 ชม.)",
  daily_cleanup: "ล้างข้อมูลเก่า (รายวัน 01:00)",
  model_retrain: "เทรนโมเดลใหม่ (รายวัน 02:00)",
  forecast_generate: "สร้างพยากรณ์",
};

const TABLE_LABELS: Record<string, string> = {
  air_quality_hourly: "คุณภาพอากาศรายชั่วโมง",
  weather_hourly: "สภาพอากาศรายชั่วโมง",
  hotspot_daily: "จุดความร้อนรายวัน",
  daily_summary: "สรุปรายวัน",
};

function StatusDot({ status }: { status: string }) {
  if (status === "success" || status === "idle")
    return <CheckCircle2 size={15} className="text-emerald-500" />;
  if (status === "error") return <XCircle size={15} className="text-red-500" />;
  return <Clock size={15} className="text-amber-500" />;
}

export default async function SystemPage() {
  if (!isSupabaseConfigured) return <NotConfiguredState />;
  let jobs, cronLogs, freshness, modelMetrics;
  try {
    [jobs, cronLogs, freshness, modelMetrics] = await Promise.all([
      getSyncJobs(),
      getCronLogs(20),
      getDataFreshness(),
      getModelMetrics(),
    ]);
  } catch (err) {
    console.error("[system] load error:", err);
    if (isNetworkRestrictedError(err)) return <NetworkRestrictedState />;
    return <ErrorState />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">สถานะระบบ</h1>
        <p className="muted text-sm">สถานะการซิงค์ข้อมูล ความสดของข้อมูล และประวัติการล้างข้อมูล</p>
      </div>

      <Section title="ความสดของข้อมูล" description="ตารางหลักในฐานข้อมูล Supabase">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {freshness.map((f) => (
            <div key={f.table} className="card card-pad">
              <div className="flex items-center justify-between">
                <p className="section-title">{TABLE_LABELS[f.table] ?? f.table}</p>
                <Database size={15} className="muted" />
              </div>
              <p className="mt-2 text-sm font-semibold"><RelativeTime iso={f.latest} /></p>
              <p className="muted text-xs">{f.rowCount != null ? `${fmtNumber(f.rowCount)} แถว` : "–"}</p>
            </div>
          ))}
        </div>
      </Section>

      {modelMetrics.length > 0 && (() => {
        const byModel = modelMetrics.reduce<Record<string, typeof modelMetrics>>((acc, m) => {
          (acc[m.modelName] ??= []).push(m);
          return acc;
        }, {});
        return (
          <Section
            title="โมเดลพยากรณ์ที่ใช้งาน"
            description="ค่าวัดประสิทธิภาพจาก model_registry — ยิ่งต่ำยิ่งดีสำหรับ MAE/RMSE; R² ใกล้ 1 = ดี"
          >
            {Object.entries(byModel).map(([name, rows]) => {
              const avg = (vals: (number | null)[]) => {
                const nums = vals.filter((v): v is number => v != null);
                return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
              };
              const avgMae = avg(rows.map((r) => r.mae));
              const avgRmse = avg(rows.map((r) => r.rmse));
              const avgR2 = avg(rows.map((r) => r.r2));
              const minR2 = rows.reduce<number | null>((m, r) => r.r2 != null && (m == null || r.r2 < m) ? r.r2 : m, null);
              const trainedAt = rows[0]?.trainedAt;
              return (
                <div key={name} className="card card-pad space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold font-mono text-sm">{name}</p>
                      {MODEL_LABELS[name] && (
                        <p className="text-xs text-foreground/70">{MODEL_LABELS[name]}</p>
                      )}
                      <p className="muted text-xs">
                        เทรนเมื่อ <RelativeTime iso={trainedAt} /> · {rows.length} จังหวัด
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="muted text-xs">MAE (เฉลี่ย)</p>
                      <p className="text-lg font-semibold tabular-nums">
                        {avgMae != null ? avgMae.toFixed(2) : "–"}
                      </p>
                      <p className="muted text-xs">µg/m³</p>
                    </div>
                    <div>
                      <p className="muted text-xs">RMSE (เฉลี่ย)</p>
                      <p className="text-lg font-semibold tabular-nums">
                        {avgRmse != null ? avgRmse.toFixed(2) : "–"}
                      </p>
                      <p className="muted text-xs">µg/m³</p>
                    </div>
                    <div>
                      <p className="muted text-xs">R² (เฉลี่ย / ต่ำสุด)</p>
                      <p className="text-lg font-semibold tabular-nums">
                        {avgR2 != null ? avgR2.toFixed(2) : "–"}
                      </p>
                      <p className="muted text-xs">
                        {minR2 != null ? `min ${minR2.toFixed(2)}` : ""}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </Section>
        );
      })()}

      <Section title="งานซิงค์ข้อมูล (Cron Jobs)">
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="muted border-b border-border text-left text-xs">
                <th className="px-4 py-2.5 font-medium">งาน</th>
                <th className="px-4 py-2.5 font-medium">สถานะ</th>
                <th className="hidden px-4 py-2.5 font-medium sm:table-cell">รอบการทำงาน</th>
                <th className="hidden px-4 py-2.5 text-right font-medium md:table-cell">ระเบียน</th>
                <th className="px-4 py-2.5 text-right font-medium">สำเร็จล่าสุด</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6">
                    <EmptyState description="ยังไม่มีงานซิงค์" />
                  </td>
                </tr>
              )}
              {jobs.map((j) => (
                <tr key={j.jobName} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2.5 font-medium">{JOB_LABELS[j.jobName] ?? j.jobName}</td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-1.5">
                      <StatusDot status={j.status} />
                      <span className="capitalize">{j.status}</span>
                    </span>
                  </td>
                  <td className="muted hidden px-4 py-2.5 sm:table-cell">{j.schedule ?? "–"}</td>
                  <td className="hidden px-4 py-2.5 text-right tabular-nums md:table-cell">{fmtNumber(j.recordsProcessed)}</td>
                  <td className="muted px-4 py-2.5 text-right text-xs"><RelativeTime iso={j.lastSuccessAt} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="ประวัติการจัดการข้อมูล (Cron Log)">
        <div className="card">
          <CardHeader title="Cron Job History" description="บันทึกการทำงานของงานอัตโนมัติทั้งหมด" />
          {cronLogs.length === 0 ? (
            <div className="card-pad">
              <EmptyState description="ยังไม่มีประวัติการทำงาน — งาน cron ยังไม่เคยรัน" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="muted border-b border-border text-left text-xs">
                    <th className="px-4 py-2.5 font-medium">งาน</th>
                    <th className="px-4 py-2.5 font-medium">สถานะ</th>
                    <th className="hidden px-4 py-2.5 text-right font-medium sm:table-cell">
                      <span className="inline-flex items-center gap-1"><ArrowDownToLine size={11} /> รับ</span>
                    </th>
                    <th className="hidden px-4 py-2.5 text-right font-medium sm:table-cell">
                      <span className="inline-flex items-center gap-1"><ArrowUpFromLine size={11} /> ส่ง</span>
                    </th>
                    <th className="hidden px-4 py-2.5 text-right font-medium md:table-cell">
                      <span className="inline-flex items-center gap-1"><Timer size={11} /> ระยะเวลา</span>
                    </th>
                    <th className="px-4 py-2.5 text-right font-medium">เวลา</th>
                  </tr>
                </thead>
                <tbody>
                  {cronLogs.map((c) => (
                    <tr key={c.id} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-2.5 font-medium">{JOB_LABELS[c.jobName] ?? c.jobName}</td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-1.5">
                          <StatusDot status={c.status} />
                          <span className="capitalize">{c.status}</span>
                        </span>
                      </td>
                      <td className="hidden px-4 py-2.5 text-right tabular-nums sm:table-cell">
                        {c.recordsIn != null ? fmtNumber(c.recordsIn) : "–"}
                      </td>
                      <td className="hidden px-4 py-2.5 text-right tabular-nums sm:table-cell">
                        {c.recordsOut != null ? fmtNumber(c.recordsOut) : "–"}
                      </td>
                      <td className="hidden px-4 py-2.5 text-right tabular-nums md:table-cell">
                        {c.durationMs != null ? `${fmtNumber(c.durationMs)} ms` : "–"}
                      </td>
                      <td className="muted px-4 py-2.5 text-right text-xs">{fmtDateTimeTh(c.startedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}
