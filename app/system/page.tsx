import type { Metadata } from "next";
import { CheckCircle2, Clock, Database, XCircle, Timer, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { fmtNumber, fmtDateTimeTh } from "@/lib/format";
import { RelativeTime } from "@/components/ui/relative-time";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getCronLogs, getDataFreshness, getModelStatuses, getSyncJobs } from "@/services/system.service";
import { isNetworkRestrictedError } from "@/services/_db";
import { Section, CardHeader } from "@/components/ui/card";
import { NotConfiguredState, ErrorState, NetworkRestrictedState, EmptyState } from "@/components/ui/states";
import { getModelLabel } from "@/lib/model-labels";
import { ISAN_PROVINCES } from "@/lib/isan";

export const metadata: Metadata = { title: "สถานะระบบ" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

const JOB_LABELS: Record<string, string> = {
  pm25_sync: "ซิงค์ PM2.5 (รายชั่วโมง)",
  weather_sync: "ซิงค์สภาพอากาศ (รายชั่วโมง)",
  hotspot_sync: "ซิงค์จุดความร้อน (ทุก 6 ชม.)",
  daily_pipeline: "ประมวลผลรายวัน (01:30 น.)",
  daily_cleanup: "ล้างข้อมูลเก่า (ในรอบ 01:30 น.)",
  model_retrain: "เทรนโมเดล (สั่งรันด้วยตนเอง)",
  forecast_generate: "สร้างพยากรณ์สำรอง (ไม่รันอัตโนมัติ)",
  ml_forecast: "พยากรณ์ ML (หลังรอบ 01:30 น.)",
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
  let jobs, cronLogs, freshness, modelStatuses;
  try {
    [jobs, cronLogs, freshness, modelStatuses] = await Promise.all([
      getSyncJobs(),
      getCronLogs(20),
      getDataFreshness(),
      getModelStatuses(),
    ]);
  } catch (err) {
    console.error("[system] load error:", err);
    if (isNetworkRestrictedError(err)) return <NetworkRestrictedState />;
    return <ErrorState />;
  }

  const readyRegressionCount = ISAN_PROVINCES.filter((province) =>
    modelStatuses.some((model) =>
      model.provinceId === province.id
      && model.taskType === "regression"
      && model.activeEligible,
    ),
  ).length;
  const readyClassificationCount = ISAN_PROVINCES.filter((province) =>
    modelStatuses.some((model) =>
      model.provinceId === province.id
      && model.taskType === "classification"
      && model.activeEligible,
    ),
  ).length;
  const calculatedClassificationCount = Math.max(
    0,
    readyRegressionCount - readyClassificationCount,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">สถานะระบบ</h1>
        <p className="muted text-sm">ความพร้อมของข้อมูล โมเดลพยากรณ์ และงานอัตโนมัติ</p>
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

      {modelStatuses.length > 0 && (
        <Section
          title="สถานะโมเดลรายจังหวัด"
          description="แยกโมเดลที่ใช้งานจริงออกจากผลเทรนรอบล่าสุด เพื่อให้เห็นว่ารอบใหม่ถูกเปิดใช้หรือยัง"
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="card card-pad">
              <p className="muted text-xs">พร้อมพยากรณ์ PM2.5</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {readyRegressionCount} <span className="text-sm font-medium">จังหวัด</span>
              </p>
              <p className="mt-1 text-xs text-emerald-600">ระบบพยากรณ์หลักพร้อมใช้งาน</p>
            </div>
            <div className="card card-pad">
              <p className="muted text-xs">จัดระดับด้วยโมเดลโดยตรง</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {readyClassificationCount} <span className="text-sm font-medium">จังหวัด</span>
              </p>
              <p className="muted mt-1 text-xs">ใช้ตัวจัดระดับที่ผ่านการตรวจสอบ</p>
            </div>
            <div className="card card-pad">
              <p className="muted text-xs">จัดระดับจากค่า PM2.5</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {calculatedClassificationCount} <span className="text-sm font-medium">จังหวัด</span>
              </p>
              <p className="mt-1 text-xs text-sky-600">ยังแสดงระดับคุณภาพอากาศได้ตามปกติ</p>
            </div>
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="muted border-b border-border text-left text-xs">
                  <th className="px-4 py-2.5 font-medium">จังหวัด</th>
                  <th className="px-4 py-2.5 font-medium">การพยากรณ์ PM2.5</th>
                  <th className="px-4 py-2.5 font-medium">การจัดระดับคุณภาพอากาศ</th>
                  <th className="px-4 py-2.5 font-medium">ความพร้อมโดยรวม</th>
                  <th className="px-4 py-2.5 text-right font-medium">อัปเดตโมเดลล่าสุด</th>
                </tr>
              </thead>
              <tbody>
                {ISAN_PROVINCES.map((province) => {
                  const rows = modelStatuses.filter((row) => row.provinceId === province.id);
                  const regression = rows.find((row) => row.taskType === "regression");
                  const classification = rows.find((row) => row.taskType === "classification");
                  const regressionReady = regression?.activeEligible === true;
                  const classificationReady = classification?.activeEligible === true;
                  const latest = [...rows].sort((a, b) =>
                    b.latestTrainedAt.localeCompare(a.latestTrainedAt),
                  )[0]?.latestTrainedAt ?? null;
                  const candidateStatus = (model: typeof regression) => {
                    if (!model) return "ยังไม่มีผลเทรน";
                    if (model.latestIsActive) return "ผ่านเกณฑ์และเปิดใช้แล้ว";
                    if (model.latestEligible) return "ผ่านเกณฑ์—รอเปิดใช้";
                    return "ยังไม่ผ่านเกณฑ์—คงใช้โมเดลเดิม";
                  };
                  return (
                    <tr key={province.id} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-2.5">
                        <p className="font-medium">{province.nameTh}</p>
                        <p className="muted text-xs">{province.id}</p>
                      </td>
                      <td className="px-4 py-2.5">
                        <p className={`inline-flex items-center gap-1.5 font-medium ${
                          regressionReady ? "text-emerald-600" : "text-red-600"
                        }`}>
                          {regressionReady
                            ? <CheckCircle2 size={15} />
                            : <XCircle size={15} />}
                          {regressionReady ? "พร้อมใช้งาน" : "ยังไม่พร้อม"}
                        </p>
                        <p className="muted mt-0.5 max-w-xs text-xs">
                          {regression?.activeModelName
                            ? `ใช้งานอยู่: ${getModelLabel(regression.activeModelName)}`
                            : "ยังไม่มีโมเดลพยากรณ์ที่เปิดใช้งาน"}
                        </p>
                        <p className={`mt-1 max-w-xs text-xs ${
                          regression?.latestIsActive
                            ? "text-emerald-600"
                            : regression?.latestEligible
                              ? "text-amber-600"
                              : "muted"
                        }`}>
                          รอบล่าสุด: {candidateStatus(regression)}
                        </p>
                      </td>
                      <td className="px-4 py-2.5">
                        <p className={`inline-flex items-center gap-1.5 font-medium ${
                          classificationReady
                            ? "text-emerald-600"
                            : regressionReady
                              ? "text-sky-600"
                              : "text-red-600"
                        }`}>
                          {regressionReady
                            ? <CheckCircle2 size={15} />
                            : <XCircle size={15} />}
                          {classificationReady
                            ? "โมเดลจัดระดับพร้อมใช้"
                            : regressionReady
                              ? "คำนวณจากค่า PM2.5"
                              : "ยังไม่พร้อม"}
                        </p>
                        <p className="muted mt-0.5 max-w-xs text-xs">
                          {classificationReady && classification?.activeModelName
                            ? `ใช้งานอยู่: ${getModelLabel(classification.activeModelName)}`
                            : regressionReady
                              ? "แปลงค่าพยากรณ์เป็นระดับคุณภาพอากาศตามเกณฑ์"
                              : "ต้องมีโมเดลพยากรณ์ก่อน"}
                        </p>
                        {classification && (
                          <p className={`mt-1 max-w-xs text-xs ${
                            classification.latestIsActive
                              ? "text-emerald-600"
                              : classification.latestEligible
                                ? "text-amber-600"
                                : "muted"
                          }`}>
                            รอบล่าสุด: {candidateStatus(classification)}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={regressionReady ? "text-emerald-600" : "text-red-600"}>
                          {regressionReady ? "พร้อมใช้งาน" : "ต้องตรวจสอบ"}
                        </span>
                        {regressionReady && !classificationReady && (
                          <p className="muted text-xs">ใช้วิธีคำนวณระดับตามเกณฑ์ของระบบ</p>
                        )}
                      </td>
                      <td className="muted px-4 py-2.5 text-right text-xs">
                        <RelativeTime iso={latest} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
      )}

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
