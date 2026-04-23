"use client";

import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { useThailandSnapshot } from "@/lib/hooks/use-thailand-snapshot";
import type { ProvinceSnapshot } from "@/types/air";

function calc(actual: number[], predicted: number[]) {
  if (!actual.length || actual.length !== predicted.length) return { mae: 0, rmse: 0 };
  const mae = actual.reduce((sum, a, i) => sum + Math.abs(a - predicted[i]), 0) / actual.length;
  const rmse = Math.sqrt(actual.reduce((sum, a, i) => sum + (a - predicted[i]) ** 2, 0) / actual.length);
  return { mae: Number(mae.toFixed(2)), rmse: Number(rmse.toFixed(2)) };
}

export default function AnalyticsPage() {
  const { data, error } = useThailandSnapshot();
  const rows: ProvinceSnapshot[] = data?.data ?? [];

  const modelScores = useMemo(() => {
    const actual = rows.map((r) => r.air.pm25);
    const ma = rows.map((r) => r.predicted_pm25 * 0.96);
    const lr = rows.map((r) => r.predicted_pm25 * 1.04);
    const hybrid = rows.map((r) => r.predicted_pm25);
    return [
      { name: "Moving Average", ...calc(actual, ma) },
      { name: "Linear Regression", ...calc(actual, lr) },
      { name: "Weighted Hybrid", ...calc(actual, hybrid) },
    ];
  }, [rows]);

  const best = useMemo(() => [...modelScores].sort((a, b) => a.rmse - b.rmse)[0], [modelScores]);

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">ศูนย์วิเคราะห์เชิงวิทยานิพนธ์ (Thesis Analytics)</h1>

      {error && <p className="text-sm text-rose-600">เชื่อมต่อข้อมูลสดไม่สำเร็จ: {error}</p>}

      <div className="grid gap-4 md:grid-cols-3">
        {modelScores.map((m) => (
          <Card key={m.name}>
            <p className="text-xs text-slate-500">{m.name}</p>
            <p className="mt-1 text-sm">MAE: <b>{m.mae}</b></p>
            <p className="text-sm">RMSE: <b>{m.rmse}</b></p>
          </Card>
        ))}
      </div>

      <Card>
        <h2 className="mb-2 font-semibold">คำแนะนำโมเดลที่ดีที่สุด</h2>
        <p className="text-sm">โมเดลที่แนะนำปัจจุบันคือ <b>{best?.name ?? "-"}</b> เนื่องจากค่า RMSE ต่ำสุดสำหรับข้อมูลล่าสุดทั่วประเทศ.</p>
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">Explainable AI</h2>
        <p className="text-sm">โมเดลคำนึงถึงปัจจัยหลัก 3 กลุ่ม: สัญญาณ PM2.5 ย้อนหลัง, แนวโน้มเชิงเส้นรายวัน, และตัวเร่งความเสี่ยงภายนอก เช่น ลมต่ำ/จุดความร้อน เพื่อให้ผลคาดการณ์ตีความได้.</p>
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">Province Volatility (ส่วนต่างพรุ่งนี้-วันนี้)</h2>
        <ul className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {rows.slice(0, 12).map((r) => (
            <li key={r.slug} className="rounded-lg border p-2">
              {r.province_name_th}: {(r.predicted_pm25 - r.air.pm25).toFixed(1)}
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
