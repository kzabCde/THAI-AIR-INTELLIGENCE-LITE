"use client";

import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { ModelComparisonChart } from "@/components/charts/model-comparison-chart";
import type { ModelMetrics } from "@/lib/ml-engine";

interface MetricsPayload {
  generated_at: string;
  global_best_model: string;
  global_metrics: ModelMetrics[];
  province_metrics: {
    slug: string;
    province_name_th: string;
    region: string;
    best_model: string;
    metrics: ModelMetrics[];
  }[];
}

const METRIC_OPTIONS = [
  { key: "rmse" as const, label: "RMSE (ต่ำ = ดี)", desc: "Root Mean Square Error" },
  { key: "mae" as const, label: "MAE (ต่ำ = ดี)", desc: "Mean Absolute Error" },
  { key: "r2" as const, label: "R² (สูง = ดี)", desc: "Coefficient of Determination" },
];

const MODEL_DESCRIPTIONS: Record<string, string> = {
  ARIMA: "Autoregressive Integrated Moving Average - เหมาะกับ time series ที่มีแนวโน้มชัดเจน",
  LSTM: "Long Short-Term Memory - Neural Network จดจำรูปแบบระยะยาว",
  "ARIMA-LSTM": "Hybrid Model ผสม ARIMA กับ LSTM - จับทั้ง linear และ non-linear patterns",
  LightGBM: "Gradient Boosted Trees (Microsoft) - เร็ว แม่นยำ รองรับ features หลายชนิด",
  XGBoost: "eXtreme Gradient Boosting - มาตรฐานใน ML competitions ด้วย regularization",
  RandomForest: "Random Forest Ensemble - ทนต่อ outliers ด้วย bootstrapped decision trees",
  Ensemble: "Weighted Ensemble ของทุกโมเดล - ลด bias และ variance สูงสุด",
};

export default function ModelPerformancePage() {
  const [data, setData] = useState<MetricsPayload | null>(null);
  const [activeMetric, setActiveMetric] = useState<"rmse" | "mae" | "r2">("rmse");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/model-metrics")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const globalBest = data?.global_best_model;

  const rankedModels = useMemo(() => {
    if (!data?.global_metrics) return [];
    return [...data.global_metrics].sort((a, b) =>
      activeMetric === "r2" ? b.r2 - a.r2 : a[activeMetric] - b[activeMetric]
    );
  }, [data, activeMetric]);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">ML Model Performance</h1>
        <p className="mt-1 text-sm text-slate-500">เปรียบเทียบ 7 โมเดล · ARIMA · LSTM · Hybrid · Tree-Based · Ensemble</p>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />)}
        </div>
      ) : data ? (
        <>
          {/* Best model banner */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl border border-sky-200 bg-gradient-to-r from-sky-50 to-indigo-50 p-5 dark:border-sky-800 dark:from-sky-950/30 dark:to-indigo-950/30"
          >
            <p className="text-sm text-sky-700 dark:text-sky-300">โมเดลที่ดีที่สุดสำหรับข้อมูลปัจจุบัน</p>
            <p className="mt-1 text-2xl font-extrabold text-sky-900 dark:text-sky-100">⭐ {globalBest}</p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{MODEL_DESCRIPTIONS[globalBest ?? ""] ?? ""}</p>
          </motion.div>

          {/* Metric selector */}
          <div className="flex flex-wrap gap-2">
            {METRIC_OPTIONS.map((m) => (
              <button
                key={m.key}
                onClick={() => setActiveMetric(m.key)}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                  activeMetric === m.key ? "bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900" : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                }`}
              >
                {m.label}
                <span className="ml-1 text-xs font-normal opacity-70">({m.desc})</span>
              </button>
            ))}
          </div>

          {/* Bar chart */}
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 dark:border-slate-700 dark:bg-slate-900/70">
            <h2 className="mb-3 text-base font-semibold">เปรียบเทียบ {activeMetric.toUpperCase()} ทุกโมเดล</h2>
            <ModelComparisonChart metrics={data.global_metrics} activeMetric={activeMetric} />
          </div>

          {/* Ranking table */}
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 dark:border-slate-700 dark:bg-slate-900/70">
            <h2 className="mb-3 text-base font-semibold">อันดับโมเดล (เรียงตาม {activeMetric.toUpperCase()})</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-slate-500">
                    <th className="py-2 pr-4">อันดับ</th>
                    <th className="py-2 pr-4">โมเดล</th>
                    <th className="py-2 pr-4">MAE</th>
                    <th className="py-2 pr-4">RMSE</th>
                    <th className="py-2 pr-4">R²</th>
                    <th className="py-2">คำอธิบาย</th>
                  </tr>
                </thead>
                <tbody>
                  {rankedModels.map((m, i) => (
                    <tr key={m.model} className={`border-b last:border-0 ${m.model === globalBest ? "bg-sky-50 dark:bg-sky-950/20" : "hover:bg-slate-50 dark:hover:bg-slate-800/40"}`}>
                      <td className="py-2 pr-4 font-bold text-slate-400">{i + 1}</td>
                      <td className="py-2 pr-4 font-semibold">
                        {m.model}
                        {m.model === globalBest && <span className="ml-1 text-xs text-sky-600">★ Best</span>}
                      </td>
                      <td className="py-2 pr-4">{m.mae.toFixed(3)}</td>
                      <td className="py-2 pr-4">{m.rmse.toFixed(3)}</td>
                      <td className="py-2 pr-4">{m.r2.toFixed(3)}</td>
                      <td className="py-2 max-w-xs text-xs text-slate-500 hidden md:table-cell">{MODEL_DESCRIPTIONS[m.model]?.split(" - ")[0]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Province-specific */}
          {data.province_metrics.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 dark:border-slate-700 dark:bg-slate-900/70">
              <h2 className="mb-3 text-base font-semibold">Best Model รายจังหวัด (ตัวอย่าง)</h2>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {data.province_metrics.map((p) => {
                  const best = p.metrics.sort((a, b) => a.rmse - b.rmse)[0];
                  return (
                    <div key={p.slug} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold">{p.province_name_th}</p>
                          <p className="text-xs text-slate-500">{p.region}</p>
                        </div>
                        <div className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                          {p.best_model}
                        </div>
                      </div>
                      {best && (
                        <div className="mt-2 grid grid-cols-3 gap-1 text-xs">
                          <div className="text-center">
                            <p className="text-slate-500">MAE</p>
                            <p className="font-bold">{best.mae.toFixed(2)}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-slate-500">RMSE</p>
                            <p className="font-bold">{best.rmse.toFixed(2)}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-slate-500">R²</p>
                            <p className="font-bold">{best.r2.toFixed(2)}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Model descriptions */}
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 dark:border-slate-700 dark:bg-slate-900/70">
            <h2 className="mb-3 text-base font-semibold">รายละเอียดโมเดล</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {Object.entries(MODEL_DESCRIPTIONS).map(([model, desc]) => (
                <div key={model} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">{model}</p>
                    {model === globalBest && <span className="text-xs text-sky-600 font-medium">★ แนะนำ</span>}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{desc}</p>
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-slate-400">อัปเดต: {new Date(data.generated_at).toLocaleString("th-TH")}</p>
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-400">
          ไม่สามารถโหลดข้อมูล model metrics ได้
        </div>
      )}
    </section>
  );
}
