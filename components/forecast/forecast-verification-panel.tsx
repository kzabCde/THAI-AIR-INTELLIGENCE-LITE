'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fetchJson } from '@/lib/query/fetcher';
import {
  isFinalVerification, referenceLabel, summarizeVerifications,
  type VerificationReport, type VerificationRow,
} from '@/lib/forecast-verification';

const number = (value: number | null) => value === null ? '—' : value.toFixed(2);
const percent = (value: number | null) => value === null ? '—' : `${(value * 100).toFixed(1)}%`;
const statusLabels: Record<VerificationRow['status'], string> = {
  final: 'ประเมินหลังสิ้นวันแล้ว', pending: 'รอวันเป้าหมายสิ้นสุด',
  legacy: 'รอประเมินใหม่ตามเกณฑ์สิ้นวัน', insufficient_data: 'รอประเมิน / ข้อมูลไม่ครบเกณฑ์',
};
const selectClass = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900';

export function ForecastVerificationPanel({ provinceId }: { provinceId: string }) {
  const [days, setDays] = useState(30);
  const [horizon, setHorizon] = useState(1);
  const [source, setSource] = useState('open-meteo');
  const query = useQuery({
    queryKey: ['forecast-verification', provinceId, days, horizon],
    queryFn: ({ signal }) => fetchJson<VerificationReport>(
      `/api/forecast/verification?province=${provinceId}&days=${days}&horizon=${horizon}`, signal,
    ),
    staleTime: 60_000, refetchInterval: 300_000, retry: false,
  });
  const report = query.data;
  const sources = [...new Set(['open-meteo', ...(report?.rows ?? [])
    .filter(isFinalVerification).map(r => r.actual_source).filter((s): s is string => Boolean(s))])];
  const selectedSource = sources.includes(source) ? source : 'open-meteo';
  const summary = summarizeVerifications(report?.rows ?? [], selectedSource);
  const past = report?.rows.filter(r => r.target_date <= report.to) ?? [];
  const rows = (report?.rows ?? []).filter(r => !isFinalVerification(r) || r.actual_source === selectedSource);
  const scored = rows.filter(isFinalVerification);
  const chartRows = report ? Array.from({ length: days }, (_, i) => {
    const date = new Date(`${report.from}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + i);
    const target = date.toISOString().slice(0, 10);
    const row = past.find(r => r.target_date === target);
    return { date: target, predicted: row?.predicted ?? null,
      actual: row && isFinalVerification(row) && row.actual_source === selectedSource ? row.actual : null };
  }) : [];

  return (
    <section id="forecast-verification" aria-labelledby="verification-heading"
      className="scroll-mt-24 space-y-5 rounded-2xl border border-slate-200 bg-white p-4 text-slate-800 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">ตรวจสอบผลพยากรณ์</p>
          <h2 id="verification-heading" className="mt-1 text-xl font-bold">ทำนายไว้เท่าไร วันนั้นได้เท่าไร</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            เทียบค่าเฉลี่ย PM2.5 รายวันหลังสิ้นวันตามเวลาไทย ใช้คำทำนายล่าสุดที่ออกก่อนวันเป้าหมายหนึ่งรอบต่อวันและระยะพยากรณ์
          </p>
        </div>
        <button type="button" onClick={() => void query.refetch()} disabled={query.isFetching}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-slate-600">
          {query.isFetching ? 'กำลังโหลด…' : 'อัปเดตผล'}
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="grid gap-1 text-xs">ช่วงย้อนหลัง
          <select aria-label="ช่วงย้อนหลัง" value={days} onChange={e => setDays(Number(e.target.value))} className={selectClass}>
            {[7, 30, 90].map(d => <option key={d} value={d}>{d} วัน</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs">ระยะพยากรณ์
          <select aria-label="ระยะพยากรณ์" value={horizon} onChange={e => setHorizon(Number(e.target.value))} className={selectClass}>
            {[1, 2, 3, 4, 5, 6, 7].map(h => <option key={h} value={h}>ล่วงหน้า {h} วัน (D+{h})</option>)}
          </select>
        </label>
        <label className="grid max-w-full gap-1 text-xs">แหล่งข้อมูลที่ใช้เทียบ
          <select aria-label="แหล่งข้อมูลที่ใช้เทียบ" value={selectedSource} onChange={e => setSource(e.target.value)} className={`${selectClass} max-w-full`}>
            {sources.map(s => <option key={s} value={s}>{referenceLabel(s)}</option>)}
          </select>
        </label>
      </div>

      {query.isPending && <p role="status" className="py-8 text-center text-sm">กำลังโหลดผลประเมินย้อนหลัง…</p>}
      {query.isError && <p role="alert" className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
        โหลดผลประเมินไม่ได้ กรุณาลองอัปเดตผลอีกครั้ง
      </p>}
      {report && !query.isError && <>
        <div className="rounded-xl bg-slate-50 p-3 text-sm leading-relaxed dark:bg-slate-800">
          <strong>{referenceLabel(selectedSource)}</strong>
          <p>{selectedSource === 'open-meteo'
            ? 'ข้อมูลอ้างอิงนี้มาจากแบบจำลอง CAMS ผ่าน Open-Meteo ไม่ใช่ค่าตรวจวัดจากสถานีภาคพื้นดิน'
            : selectedSource.includes(',')
              ? 'วันนี้มีข้อมูลหลายแหล่งรวมกัน ผลชุดนี้แยกจากคะแนนของแหล่งเดียว และไม่ใช้ยืนยันความแม่นยำเทียบสถานี'
              : 'เป็นข้อมูลที่รับจากผู้ให้บริการ ต้องตรวจสอบสถานี หน่วย และคุณภาพข้อมูลก่อนอ้างอิงเป็นผลเทียบสถานีภาคพื้นดิน'}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {report.from} ถึง {report.to} · เกณฑ์อย่างน้อย {report.minimumHours}/24 ชั่วโมง · คะแนนแต่ละชุดใช้แหล่งอ้างอิงเดียวกัน
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ['วันที่ประเมินได้', `${summary.n} วัน`],
            ['คลาดเคลื่อนเฉลี่ย (MAE)', `${number(summary.mae)} µg/m³`],
            ['RMSE', `${number(summary.rmse)} µg/m³`],
            ['ทำนายสูง/ต่ำเฉลี่ย (Bias)', `${number(summary.bias)} µg/m³`],
          ].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
            <p className="mt-2 break-words text-lg font-bold sm:text-xl">{value}</p>
          </div>)}
        </div>
        <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          MAE และ RMSE ยิ่งต่ำยิ่งดี · Bias บวกหมายถึงทำนายสูงกว่าค่าอ้างอิง · ข้อมูลของวันปัจจุบันและอนาคตไม่รวมในคะแนน
        </p>

        {summary.n === 0 ? <p role="status" className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm dark:border-slate-600">
          ยังไม่มีผลหลังสิ้นวันที่ผ่านเกณฑ์สำหรับตัวเลือกนี้ ระบบจะแสดงคะแนนเมื่อประเมินได้ โดยไม่แทนข้อมูลที่ขาดด้วยศูนย์
        </p> : <div aria-label="กราฟเปรียบเทียบค่า PM2.5 ที่ทำนายกับข้อมูลอ้างอิง หน่วยไมโครกรัมต่อลูกบาศก์เมตร" className="h-72 w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartRows} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
              <XAxis dataKey="date" tickFormatter={v => String(v).slice(5)} minTickGap={32} tick={{ fontSize: 11 }} />
              <YAxis width={40} tick={{ fontSize: 11 }} domain={[0, 'auto']} />
              <Tooltip formatter={(v: number, name: string) => [`${number(v)} µg/m³`, name]} />
              <Legend />
              <Line dataKey="predicted" name="ค่าที่ทำนายไว้" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 2 }} connectNulls={false} isAnimationActive={false} />
              <Line dataKey="actual" name="ข้อมูลอ้างอิงหลังสิ้นวัน" stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} connectNulls={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>}

        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full min-w-[760px] text-left text-xs">
            <caption className="p-3 text-left text-sm font-semibold">รายละเอียดรายวัน · เวลาออกคำทำนายเป็นเวลาไทย · หน่วย µg/m³</caption>
            <thead className="bg-slate-50 dark:bg-slate-800"><tr>
              {['วันเป้าหมาย', 'ออกคำทำนายเมื่อ', 'ทำนาย', 'ค่าอ้างอิง', 'คลาดเคลื่อน', 'ชั่วโมง', 'สถานะ'].map(h => <th key={h} className="px-3 py-3">{h}</th>)}
            </tr></thead>
            <tbody>{[...rows].reverse().map(row => <tr key={row.id} className="border-t border-slate-100 dark:border-slate-800">
              <td className="whitespace-nowrap px-3 py-3">{row.target_date}</td>
              <td className="whitespace-nowrap px-3 py-3">{new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'short', timeStyle: 'short' }).format(new Date(row.forecast_at))}</td>
              <td className="px-3 py-3 tabular-nums">{number(row.predicted)}</td>
              <td className="px-3 py-3 tabular-nums">{isFinalVerification(row) ? number(row.actual) : '—'}</td>
              <td className="px-3 py-3 tabular-nums">{isFinalVerification(row) ? number(Math.abs(row.predicted - row.actual!)) : '—'}</td>
              <td className="px-3 py-3">{row.hours_available ?? '—'}/24</td>
              <td className="px-3 py-3">{statusLabels[row.status]}{row.revision !== null && row.revision > 1 && row.status === 'final' ? ' · ปรับปรุงแล้ว' : ''}</td>
            </tr>)}</tbody>
          </table>
          {rows.length === 0 && <p className="p-4 text-sm">ยังไม่มีคำทำนายที่ตรวจสอบย้อนกลับได้ในช่วงนี้</p>}
        </div>

        {summary.n > 0 && <details className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
          <summary className="cursor-pointer text-sm font-semibold">ผลแยกตามรุ่นโมเดลและการจำแนกระดับคุณภาพอากาศ</summary>
          <div className="mt-4 space-y-4 text-sm">
            <p>คะแนนรวมด้านบนเป็นผลที่ระบบเผยแพร่ในช่วงที่เลือก ซึ่งอาจมีหลายรุ่นโมเดล</p>
            {summary.models.map(m => <p key={`${m.name}:${m.runId}`} className="break-words text-xs">
              {m.name} · รุ่นการเทรน {m.runId ?? 'ไม่ระบุ'} · {m.n} วัน · MAE {number(m.mae)} µg/m³
            </p>)}
            <p>Random Forest / ตัวจำแนกที่ใช้งานจริง: ทายระดับถูก {percent(summary.classifier.accuracy)} จาก {summary.classifier.n} วัน</p>
            {summary.classifierModels.map(m => <p key={`${m.name}:${m.runId}`} className="break-words text-xs">
              {m.name} · รุ่นการเทรน {m.runId ?? 'ไม่ระบุ'} · {m.n} วัน · ทายระดับถูก {percent(m.accuracy)}
            </p>)}
            <p>แบ่งระดับจากค่าพยากรณ์ PM2.5 ด้วยเกณฑ์: ทายระดับถูก {percent(summary.threshold.accuracy)} จาก {summary.threshold.n} วัน</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">ความถูกต้องของระดับอากาศไม่ใช่ความแม่นยำของค่าฝุ่น และข้อมูลที่มีเพียงระดับเดียวไม่ยืนยันผลในช่วงฝุ่นสูง</p>
            <div className="overflow-x-auto"><table className="w-full min-w-[480px] text-left text-xs">
              <caption className="mb-2 text-left">ผลของตัวจำแนกที่ใช้งานจริง แยกตามระดับ</caption>
              <thead><tr>{['ระดับ', 'จำนวนวันอ้างอิง', 'Precision', 'Recall', 'F1'].map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead>
              <tbody>{summary.classifier.classes.map(c => <tr key={c.classId}>
                <td className="p-2">{c.classId}</td><td className="p-2">{c.support}</td>
                <td className="p-2">{percent(c.precision)}</td><td className="p-2">{percent(c.recall)}</td><td className="p-2">{percent(c.f1)}</td>
              </tr>)}</tbody>
            </table></div>
            <p className="text-xs">Macro F1 {percent(summary.classifier.macroF1)} เฉลี่ยเฉพาะระดับที่ปรากฏในค่าอ้างอิงหรือคำทำนาย · — หมายถึงยังคำนวณไม่ได้</p>
            <p className="text-xs">ค่าอ้างอิงอยู่ในช่วง P10–P90: {percent(summary.intervalCoverage)} ของรายการที่มีช่วงพยากรณ์</p>
          </div>
        </details>}
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {scored.length ? `ผลประเมินล่าสุด ${new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(scored.map(r => r.evaluated_at!).sort().at(-1)!))} · ` : ''}
          ข้อมูลที่เข้าช้าจะถูกตรวจซ้ำในรอบรายวันย้อนหลัง 7 วัน
        </p>
      </>}
    </section>
  );
}
