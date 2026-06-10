"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { ModelMetrics } from "@/lib/ml-engine";

interface Props {
  metrics: ModelMetrics[];
  activeMetric?: "rmse" | "mae" | "r2";
}

const MODEL_COLORS: Record<string, string> = {
  ARIMA: "#94a3b8",
  LSTM: "#818cf8",
  "ARIMA-LSTM": "#c084fc",
  LightGBM: "#34d399",
  XGBoost: "#22d3ee",
  RandomForest: "#fb923c",
  Ensemble: "#f87171",
};

export function ModelComparisonChart({ metrics, activeMetric = "rmse" }: Props) {
  const data = metrics.map((m) => ({
    model: m.model,
    [activeMetric]: activeMetric === "r2" ? m.r2 : m[activeMetric],
  }));

  const sorted = [...data].sort((a, b) =>
    activeMetric === "r2"
      ? (b[activeMetric] as number) - (a[activeMetric] as number)
      : (a[activeMetric] as number) - (b[activeMetric] as number)
  );

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={sorted} margin={{ top: 10, right: 16, left: 0, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="model" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: number) => [v.toFixed(3), activeMetric.toUpperCase()]} />
        <Bar dataKey={activeMetric} name={activeMetric.toUpperCase()} radius={[4, 4, 0, 0]}>
          {sorted.map((entry) => (
            <Cell key={entry.model} fill={MODEL_COLORS[entry.model] ?? "#94a3b8"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
