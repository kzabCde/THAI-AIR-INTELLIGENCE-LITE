import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function load(relPath, requireMap = {}) {
  const source = readFileSync(new URL(relPath, import.meta.url), "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  const req = (name) => {
    if (name in requireMap) return requireMap[name];
    throw new Error(`unexpected import ${name}`);
  };
  new Function("module", "exports", "require", js)(mod, mod.exports, req);
  return mod.exports;
}

const aqi = load("../lib/aqi.ts");
const fw = load("../lib/forecast-weather.ts", { "./aqi": aqi });

const HOUR = 3600_000;
// 2026-10-03 19:00 Asia/Bangkok == 12:00Z
const START = Date.parse("2026-10-03T12:00:00Z");

function point(offsetH, prob, mm = 0, humidity = 95) {
  return {
    t: new Date(START + offsetH * HOUR).toISOString(),
    temperature: 26 + (offsetH % 5),
    humidity,
    precipitationProbability: prob,
    precipitation: mm,
    windSpeed: 6,
    windDirection: 200,
  };
}

test("rain chance comes from the model, not humidity", () => {
  // Very humid (95 %) but the model says 2–20 % → must NOT show 80 %.
  const weather = Array.from({ length: 24 }, (_, i) => point(i, i < 8 ? 20 : 2));
  const strip = fw.computeHourlyForecastStrip({
    currentHourTimestamp: START,
    hoursCount: 24,
    baseHumidity: 95,
    precipitation: 0,
    weatherForecast: weather,
  });
  assert.equal(strip[0].rainChance, 20);
  assert.equal(strip[10].rainChance, 2);
  assert.ok(strip.every((h) => h.rainChance !== 80));
  assert.ok(strip.every((h) => !h.rainy), "no rain icon when chance is low and no rain observed");
  assert.equal(strip[5].temp, Math.round(weather[5].temperature), "uses model temperature");
});

test("without model data rain chance is unknown (null), never estimated", () => {
  const strip = fw.computeHourlyForecastStrip({
    currentHourTimestamp: START,
    hoursCount: 24,
    baseHumidity: 96,
    precipitation: 0,
  });
  assert.ok(strip.every((h) => h.rainChance === null && !h.rainy && !h.hasModelWeather));
});

test("rain icon rule: observed rain now, ≥50 %, or ≥0.5 mm", () => {
  assert.equal(fw.isRainyHour(49, 0.4), false);
  assert.equal(fw.isRainyHour(50, 0), true);
  assert.equal(fw.isRainyHour(10, 0.5), true);
  assert.equal(fw.isRainyHour(5, 0.1, true), true, "observed drizzle in the latest hour");
  assert.equal(fw.isRainyHour(null, null), false);
});

test("day summary uses the Bangkok calendar day and max hourly probability", () => {
  // Hours 0..29 from 19:00 BKK → 5 hours today (19–23), 24 tomorrow, 1 day after.
  const weather = Array.from({ length: 30 }, (_, i) => point(i, i === 20 ? 65 : 10, i === 20 ? 0.3 : 0));
  assert.equal(fw.bangkokDateKey(START), "2026-10-03");
  const today = fw.summarizeDayWeather(weather, "2026-10-03");
  const tomorrow = fw.summarizeDayWeather(weather, "2026-10-04");
  assert.equal(today.hours, 5);
  assert.equal(tomorrow.hours, 24);
  assert.equal(tomorrow.rainChanceMax, 65);
  assert.equal(tomorrow.precipitationSum, 0.3);
  assert.equal(tomorrow.rainy, true);
  assert.equal(today.rainy, false);
  assert.equal(fw.summarizeDayWeather(weather, "2026-10-09"), null);
});

test("TMD 24-hour rainfall categories", () => {
  assert.equal(fw.rain24hCategory(null), null);
  assert.equal(fw.rain24hCategory(0).label, "ไม่มีฝน");
  assert.equal(fw.rain24hCategory(1.7).label, "ฝนเล็กน้อย");
  assert.equal(fw.rain24hCategory(10.1).label, "ฝนปานกลาง");
  assert.equal(fw.rain24hCategory(35.1).label, "ฝนหนัก");
  assert.equal(fw.rain24hCategory(90.1).label, "ฝนหนักมาก");
});

test("compass conversion", () => {
  assert.equal(fw.degreesToCompass(0), "N");
  assert.equal(fw.degreesToCompass(202), "SSW");
  assert.equal(fw.degreesToCompass(225), "SW");
  assert.equal(fw.degreesToCompass(359), "N");
});
