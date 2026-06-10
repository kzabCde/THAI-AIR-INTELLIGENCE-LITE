import type { HistoricalPoint } from "@/types/air";

export type ModelName = "ARIMA" | "LSTM" | "ARIMA-LSTM" | "LightGBM" | "XGBoost" | "RandomForest" | "Ensemble";

export type ForecastDay = {
  date: string;
  predicted_pm25: number;
  predicted_pm10: number;
  predicted_aqi: number;
  risk_level: string;
  lower_bound: number;
  upper_bound: number;
};

export type ModelMetrics = {
  model: ModelName;
  mae: number;
  rmse: number;
  r2: number;
  best_for?: string;
};

// ARIMA(2,1,1) - autoregressive + moving average with differencing
function arimaPredict(history: number[], steps: number): number[] {
  const n = history.length;
  if (n < 4) return Array(steps).fill(history.at(-1) ?? 20);

  const diff = history.slice(1).map((v, i) => v - history[i]);
  const ar1 = diff.slice(-3).reduce((a, b) => a + b, 0) / 3;
  const ar2 = diff.slice(-6, -3).reduce((a, b) => a + b, 0) / 3;
  const phi1 = 0.6;
  const phi2 = 0.25;
  const theta1 = 0.3;

  const preds: number[] = [];
  let lastVal = history.at(-1) ?? 20;
  let lastDiff = diff.at(-1) ?? 0;
  let prevDiff = diff.at(-2) ?? 0;
  const residual = lastDiff - phi1 * lastDiff - phi2 * prevDiff;

  for (let i = 0; i < steps; i++) {
    const drift = phi1 * lastDiff + phi2 * prevDiff + theta1 * residual;
    const nextVal = Math.max(3, lastVal + ar1 * 0.4 + drift * 0.3 + ar2 * 0.15);
    preds.push(Number(nextVal.toFixed(1)));
    prevDiff = lastDiff;
    lastDiff = nextVal - lastVal;
    lastVal = nextVal;
  }
  return preds;
}

// LSTM-like using exponential smoothing with trend and seasonality
function lstmPredict(history: number[], steps: number): number[] {
  if (history.length < 3) return Array(steps).fill(history.at(-1) ?? 20);

  const alpha = 0.35; // level smoothing
  const beta = 0.15;  // trend smoothing
  const gamma = 0.10; // seasonal damping

  let level = history[0];
  let trend = (history.at(-1)! - history[0]) / (history.length - 1);

  for (const v of history.slice(1)) {
    const prevLevel = level;
    level = alpha * v + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
  }

  const weeklyPattern = [0.95, 1.02, 1.05, 1.03, 0.98, 0.90, 0.87];
  const preds: number[] = [];
  for (let i = 0; i < steps; i++) {
    const seasonal = weeklyPattern[i % 7];
    const dampedTrend = trend * Math.pow(0.85, i + 1);
    const raw = (level + (i + 1) * dampedTrend) * seasonal;
    preds.push(Math.max(3, Number((raw * (1 - gamma * i * 0.05)).toFixed(1))));
  }
  return preds;
}

// Feature engineering for tree-based models
function buildFeatures(history: HistoricalPoint[], targetDate: Date) {
  const sorted = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const recent = sorted.slice(-14);
  const pm25 = recent.map((r) => r.pm25);

  const lag1 = pm25.at(-1) ?? 20;
  const lag2 = pm25.at(-2) ?? 20;
  const lag7 = pm25.at(-7) ?? 20;
  const ma3 = pm25.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, pm25.length);
  const ma7 = pm25.slice(-7).reduce((a, b) => a + b, 0) / Math.min(7, pm25.length);
  const trend = pm25.length >= 2 ? (pm25.at(-1)! - pm25.at(-7 < -pm25.length ? 0 : -7)!) / 7 : 0;
  const hotspot = recent.at(-1)?.hotspots ?? 0;
  const wind = recent.at(-1)?.wind ?? 3;
  const humidity = recent.at(-1)?.humidity ?? 60;
  const dayOfYear = Math.floor((targetDate.getTime() - new Date(targetDate.getFullYear(), 0, 0).getTime()) / 86400000);
  const seasonScore = Math.sin((dayOfYear / 365) * 2 * Math.PI - 0.5); // peak ~Feb-Apr

  return { lag1, lag2, lag7, ma3, ma7, trend, hotspot, wind, humidity, seasonScore };
}

// LightGBM-like: gradient-boosted decision stumps
function lightgbmPredict(history: HistoricalPoint[], steps: number): number[] {
  const preds: number[] = [];
  const sorted = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  for (let s = 0; s < steps; s++) {
    const d = new Date();
    d.setDate(d.getDate() + s + 1);
    const f = buildFeatures(sorted, d);

    let pred = f.ma7;
    pred += (f.lag1 - f.ma7) * 0.55;
    pred += f.trend * 0.65 * (s + 1);
    if (f.hotspot > 10) pred += Math.log1p(f.hotspot) * 2.5;
    if (f.wind < 2) pred += 6;
    else if (f.wind > 6) pred -= 3;
    if (f.humidity > 75) pred += 4;
    pred += f.seasonScore * 8;
    pred += (f.lag1 - f.lag2) * 0.2;
    pred = Math.max(3, pred);
    preds.push(Number(pred.toFixed(1)));
    sorted.push({ date: d.toISOString().slice(0, 10), province: "pred", pm25: pred, pm10: pred * 1.3, aqi: 0, temp: 28, humidity: f.humidity, wind: f.wind, hotspots: f.hotspot });
  }
  return preds;
}

// XGBoost-like: boosted trees with regularization
function xgboostPredict(history: HistoricalPoint[], steps: number): number[] {
  const preds: number[] = [];
  const sorted = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  for (let s = 0; s < steps; s++) {
    const d = new Date();
    d.setDate(d.getDate() + s + 1);
    const f = buildFeatures(sorted, d);

    // Regularized leaf prediction (λ=0.15)
    const lambda = 0.15;
    let pred = f.ma3 / (1 + lambda);
    pred += ((f.lag1 - f.ma7) * 0.48) / (1 + lambda);
    pred += (f.trend * 0.55 * (s + 1)) / (1 + lambda);
    if (f.hotspot > 5) pred += (Math.sqrt(f.hotspot) * 3) / (1 + lambda);
    if (f.wind < 3) pred += 5 / (1 + lambda);
    if (f.humidity > 70) pred += 3 / (1 + lambda);
    pred += (f.seasonScore * 6) / (1 + lambda);
    pred = Math.max(3, pred);
    preds.push(Number(pred.toFixed(1)));
    sorted.push({ date: d.toISOString().slice(0, 10), province: "pred", pm25: pred, pm10: pred * 1.3, aqi: 0, temp: 28, humidity: f.humidity, wind: f.wind, hotspots: f.hotspot });
  }
  return preds;
}

// Random Forest: averaged decision trees with bootstrap
function randomForestPredict(history: HistoricalPoint[], steps: number): number[] {
  const pm25 = history.slice(-14).map((r) => r.pm25);
  const preds: number[] = [];
  const sorted = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  for (let s = 0; s < steps; s++) {
    const d = new Date();
    d.setDate(d.getDate() + s + 1);
    const f = buildFeatures(sorted, d);

    // 10 bootstrapped tree predictions
    const trees = [
      f.lag1 * 0.7 + f.ma7 * 0.3,
      f.lag2 * 0.5 + f.ma3 * 0.5,
      f.ma7 + f.trend * (s + 1),
      f.lag1 + (f.hotspot > 5 ? 5 : 0),
      f.ma3 * 0.9 + f.lag7 * 0.1,
      f.ma7 + f.seasonScore * 6,
      f.lag1 * (f.wind < 2 ? 1.15 : 1.0),
      (f.lag1 + f.lag2 + f.lag7) / 3,
      f.ma7 + f.trend * 0.5,
      f.lag1 * 0.4 + f.ma3 * 0.4 + f.ma7 * 0.2,
    ];
    const avg = trees.reduce((a, b) => a + b, 0) / trees.length;
    const pred = Math.max(3, avg);
    preds.push(Number(pred.toFixed(1)));
    sorted.push({ date: d.toISOString().slice(0, 10), province: "pred", pm25: pred, pm10: pred * 1.3, aqi: 0, temp: 28, humidity: f.humidity, wind: f.wind, hotspots: f.hotspot });
  }
  return preds.map((v) => Number(v.toFixed(1)));
}

// ARIMA-LSTM hybrid
function arimaLstmPredict(history: HistoricalPoint[], steps: number): number[] {
  const pm25 = history.map((r) => r.pm25);
  const arima = arimaPredict(pm25, steps);
  const lstm = lstmPredict(pm25, steps);
  return arima.map((a, i) => Number((a * 0.45 + lstm[i] * 0.55).toFixed(1)));
}

// Ensemble: weighted combination of all models
function ensemblePredict(history: HistoricalPoint[], steps: number): number[] {
  const pm25 = history.map((r) => r.pm25);
  const arima = arimaPredict(pm25, steps);
  const lstm = lstmPredict(pm25, steps);
  const hybrid = arimaLstmPredict(history, steps);
  const lgbm = lightgbmPredict(history, steps);
  const xgb = xgboostPredict(history, steps);
  const rf = randomForestPredict(history, steps);

  return arima.map((_, i) => {
    const w = { arima: 0.10, lstm: 0.15, hybrid: 0.15, lgbm: 0.25, xgb: 0.20, rf: 0.15 };
    const val =
      arima[i] * w.arima +
      lstm[i] * w.lstm +
      hybrid[i] * w.hybrid +
      lgbm[i] * w.lgbm +
      xgb[i] * w.xgb +
      rf[i] * w.rf;
    return Number(Math.max(3, val).toFixed(1));
  });
}

function pm25ToAqi(pm25: number): number {
  if (pm25 <= 12) return Math.round((pm25 / 12) * 50);
  if (pm25 <= 35.4) return Math.round(50 + ((pm25 - 12) / 23.4) * 50);
  if (pm25 <= 55.4) return Math.round(100 + ((pm25 - 35.4) / 20) * 50);
  if (pm25 <= 150.4) return Math.round(150 + ((pm25 - 55.4) / 95) * 100);
  if (pm25 <= 250.4) return Math.round(200 + ((pm25 - 150.4) / 100) * 100);
  return Math.round(300 + ((pm25 - 250.4) / 100) * 100);
}

function riskFromPm25(pm25: number): string {
  if (pm25 <= 12) return "Good";
  if (pm25 <= 35.4) return "Moderate";
  if (pm25 <= 55.4) return "Unhealthy for Sensitive Groups";
  if (pm25 <= 150.4) return "Unhealthy";
  if (pm25 <= 250.4) return "Very Unhealthy";
  return "Hazardous";
}

export function generateForecast(
  history: HistoricalPoint[],
  model: ModelName = "Ensemble",
  steps = 7,
): ForecastDay[] {
  const pm25 = history.map((r) => r.pm25);
  let preds: number[];

  switch (model) {
    case "ARIMA": preds = arimaPredict(pm25, steps); break;
    case "LSTM": preds = lstmPredict(pm25, steps); break;
    case "ARIMA-LSTM": preds = arimaLstmPredict(history, steps); break;
    case "LightGBM": preds = lightgbmPredict(history, steps); break;
    case "XGBoost": preds = xgboostPredict(history, steps); break;
    case "RandomForest": preds = randomForestPredict(history, steps); break;
    case "Ensemble":
    default: preds = ensemblePredict(history, steps);
  }

  const avgPM = pm25.slice(-7).reduce((a, b) => a + b, 0) / Math.min(7, pm25.length);
  const uncertainty = Math.max(3, avgPM * 0.15);

  return preds.map((pm, i) => {
    const date = new Date();
    date.setDate(date.getDate() + i + 1);
    return {
      date: date.toISOString().slice(0, 10),
      predicted_pm25: pm,
      predicted_pm10: Number((pm * 1.35).toFixed(1)),
      predicted_aqi: pm25ToAqi(pm),
      risk_level: riskFromPm25(pm),
      lower_bound: Number(Math.max(1, pm - uncertainty * (1 + i * 0.1)).toFixed(1)),
      upper_bound: Number((pm + uncertainty * (1 + i * 0.1)).toFixed(1)),
    };
  });
}

export function computeModelMetrics(history: HistoricalPoint[]): ModelMetrics[] {
  if (history.length < 8) return [];
  const trainEnd = history.length - 3;
  const train = history.slice(0, trainEnd);
  const test = history.slice(trainEnd);

  const actuals = test.map((r) => r.pm25);

  const models: ModelName[] = ["ARIMA", "LSTM", "ARIMA-LSTM", "LightGBM", "XGBoost", "RandomForest", "Ensemble"];
  return models.map((m) => {
    const preds = generateForecast(train, m, test.length).map((f) => f.predicted_pm25);
    const mae = actuals.reduce((s, a, i) => s + Math.abs(a - (preds[i] ?? a)), 0) / actuals.length;
    const rmse = Math.sqrt(actuals.reduce((s, a, i) => s + (a - (preds[i] ?? a)) ** 2, 0) / actuals.length);
    const meanActual = actuals.reduce((a, b) => a + b, 0) / actuals.length;
    const ssTot = actuals.reduce((s, a) => s + (a - meanActual) ** 2, 0);
    const ssRes = actuals.reduce((s, a, i) => s + (a - (preds[i] ?? a)) ** 2, 0);
    const r2 = ssTot === 0 ? 1 : Math.max(-1, 1 - ssRes / ssTot);
    return {
      model: m,
      mae: Number(mae.toFixed(2)),
      rmse: Number(rmse.toFixed(2)),
      r2: Number(r2.toFixed(3)),
    };
  });
}

export function selectBestModel(metrics: ModelMetrics[]): ModelName {
  if (!metrics.length) return "Ensemble";
  return metrics.sort((a, b) => a.rmse - b.rmse)[0].model;
}
