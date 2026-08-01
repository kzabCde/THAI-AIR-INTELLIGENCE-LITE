import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const forecastPage = readFileSync(
  new URL("../app/forecast/page.tsx", import.meta.url),
  "utf8",
);
const systemPage = readFileSync(
  new URL("../app/system/page.tsx", import.meta.url),
  "utf8",
);
const forecastService = readFileSync(
  new URL("../services/forecast.service.ts", import.meta.url),
  "utf8",
);
const systemService = readFileSync(
  new URL("../services/system.service.ts", import.meta.url),
  "utf8",
);
const trainingPipeline = readFileSync(
  new URL("../training/train_dual_models.py", import.meta.url),
  "utf8",
);

test("public pages use plain-language model and forecast statuses", () => {
  assert.match(systemPage, /พร้อมพยากรณ์ PM2\.5/);
  assert.match(systemPage, /คำนวณจากค่า PM2\.5/);
  assert.match(forecastPage, /ความน่าเชื่อถือของผล/);
  assert.match(forecastPage, /วิธีจัดระดับคุณภาพอากาศ/);
  assert.match(forecastPage, /คำนวณจากค่าพยากรณ์ PM2\.5/);
});

test("training evaluation metrics are absent from public pages", () => {
  const publicPages = `${forecastPage}\n${systemPage}`;
  for (const metric of [
    "MAE",
    "RMSE",
    "R²",
    "Accuracy",
    "Precision",
    "Recall",
    "Macro F1",
    "skill_vs_persistence",
  ]) {
    assert.ok(!publicPages.includes(metric), `public page exposes ${metric}`);
  }
});

test("evaluation metrics remain available in the Python training output", () => {
  assert.match(trainingPipeline, /def regression_metrics/);
  assert.match(trainingPipeline, /def classification_metrics/);
  assert.match(trainingPipeline, /"macro_f1"/);
  assert.match(trainingPipeline, /accuracy_score/);
});

test("public services do not fetch model evaluation metrics", () => {
  assert.ok(!systemService.includes("mae,rmse,r2"));
  assert.ok(!systemService.includes("baseline_metrics"));
  assert.ok(!forecastService.includes("trained_at,metrics"));
  assert.ok(!forecastService.includes("baseline_metrics"));
});

test("legacy forecast rows are presented as threshold-based classification", () => {
  assert.match(forecastService, /fallbackUsed: !usesDirectClassifier/);
  assert.match(forecastService, /"classifier_not_active"/);
});

test("system page distinguishes validated legacy and fallback lifecycle", () => {
  for (const label of ["Validated", "Legacy", "Fallback", "Classification unavailable"]) {
    assert.ok(systemPage.includes(label), `system page missing ${label}`);
  }
  assert.match(systemPage, /สรุปรายวัน/);
  assert.match(systemPage, /พยากรณ์ ML/);
  assert.match(systemPage, /รวมทั้งกระบวนการ/);
});
