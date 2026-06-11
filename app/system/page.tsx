import type { Metadata } from "next";
import { CheckCircle2, Clock, Database, XCircle } from "lucide-react";
import { fmtNumber, fmtRelativeTh, fmtDateTimeTh } from "@/lib/format";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getCleanupLogs, getDataFreshness, getSyncJobs } from "@/services/system.service";
import { Section, CardHeader } from "@/components/ui/card";
import { NotConfiguredState, ErrorState, EmptyState } from "@/components/ui/states";

export const metadata: Metadata = { title: "สถานะระบบ" };
export const revalidate = 300;

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
  let jobs, cleanup, freshness;
  try {
    [jobs, cleanup, freshness] = await Promise.all([
      getSyncJobs(),
      getCleanupLogs(10),
      getDataFreshness(),
    ]);
  } catch {
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
              <p className="mt-2 text-sm font-semibold">{fmtRelativeTh(f.latest)}</p>
              <p className="muted text-xs">{f.rowCount != null ? `${fmtNumber(f.rowCount)} แถว` : "–"}</p>
            </div>
          ))}
        </div>
      </Section>

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
                  <td className="muted px-4 py-2.5 text-right text-xs">{fmtRelativeTh(j.lastSuccessAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="ประวัติการล้างข้อมูล">
        <div className="card">
          <CardHeader title="Cleanup Logs" description="งานลบข้อมูลเก่ารายวัน" />
          {cleanup.length === 0 ? (
            <div className="card-pad">
              <EmptyState description="ยังไม่มีประวัติการล้างข้อมูล" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="muted border-b border-border text-left text-xs">
                    <th className="px-4 py-2.5 font-medium">ตาราง</th>
                    <th className="px-4 py-2.5 text-right font-medium">ลบแถว</th>
                    <th className="px-4 py-2.5 font-medium">สถานะ</th>
                    <th className="px-4 py-2.5 text-right font-medium">เวลา</th>
                  </tr>
                </thead>
                <tbody>
                  {cleanup.map((c) => (
                    <tr key={c.id} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-2.5">{c.tableName}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmtNumber(c.rowsDeleted)}</td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-1.5">
                          <StatusDot status={c.status} /> {c.status}
                        </span>
                      </td>
                      <td className="muted px-4 py-2.5 text-right text-xs">{fmtDateTimeTh(c.ranAt)}</td>
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
