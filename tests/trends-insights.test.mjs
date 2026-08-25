import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(
  new URL("../lib/trends-insights.ts", import.meta.url),
  "utf8",
);
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const compiledModule = { exports: {} };
new Function("module", "exports", js)(compiledModule, compiledModule.exports);

const { analyzeTrendHistory, shiftTrendDate } = compiledModule.exports;

function dateRange(from, to, valueForDate = () => 20) {
  const rows = [];
  for (let date = from; date <= to; date = shiftTrendDate(date, 1)) {
    rows.push({
      date,
      pm25: valueForDate(date),
      hoursAvailable: 24,
      isBurningSeason: Number(date.slice(5, 7)) <= 4,
      trustedSources: ["open-meteo"],
      trustedObservedAt: `${date}T16:00:00Z`,
    });
  }
  return rows;
}

test("current and previous windows contain exact adjacent calendar days", () => {
  const rows = dateRange("2026-01-30", "2026-03-30", (date) => date >= "2026-03-01" ? 20 : 10);
  const result = analyzeTrendHistory(rows, 30, "2026-03-30");

  assert.equal(result.fromDate, "2026-03-01");
  assert.equal(result.previousFromDate, "2026-01-30");
  assert.equal(result.previousToDate, "2026-02-28");
  assert.equal(result.calendar.length, 30);
  assert.equal(result.current.observedDays, 30);
  assert.equal(result.previous.observedDays, 30);
  assert.equal(result.comparisonDelta, 10);
  assert.equal(result.comparisonPercent, 100);
});

test("37.5 is not an exceedance and missing dates break episodes", () => {
  const rows = [
    { date: "2026-01-01", pm25: 40, hoursAvailable: 24 },
    { date: "2026-01-02", pm25: 41, hoursAvailable: 24 },
    { date: "2026-01-04", pm25: 42, hoursAvailable: 24 },
    { date: "2026-01-05", pm25: 37.5, hoursAvailable: 24 },
  ];
  const result = analyzeTrendHistory(rows, 7, "2026-01-05");

  assert.equal(result.exceedanceDays, 3);
  assert.equal(result.episodes.length, 2);
  assert.equal(result.longestExceedanceStreak, 2);
  assert.equal(result.currentExceedanceStreak, 0);
});

test("rolling seven-day average requires all seven calendar days", () => {
  const full = dateRange("2026-01-01", "2026-01-07", (date) => Number(date.slice(-2)) * 10);
  const complete = analyzeTrendHistory(full, 7, "2026-01-07");
  assert.equal(complete.calendar.at(-1).rolling7, 40);
  assert.equal(complete.latest7Average, 40);

  const incomplete = analyzeTrendHistory(full.filter((row) => row.date !== "2026-01-04"), 7, "2026-01-07");
  assert.equal(incomplete.calendar.at(-1).rolling7, null);
  assert.equal(incomplete.latest7Average, null);
  assert.equal(incomplete.latest7ObservedDays, 6);
});

test("equal but low coverage does not make a comparison reliable", () => {
  const rows = [
    { date: "2026-01-01", pm25: 10, hoursAvailable: 24 },
    { date: "2026-01-08", pm25: 20, hoursAvailable: 24 },
  ];
  const result = analyzeTrendHistory(rows, 7, "2026-01-14");

  assert.equal(result.current.coveragePercent, 14);
  assert.equal(result.previous.coveragePercent, 14);
  assert.equal(result.comparisonCoverageGap, 0);
  assert.equal(result.comparisonReliable, false);
  assert.equal(result.comparisonDelta, null);
});

test("analysis remains anchored to yesterday and exposes recent feed gaps", () => {
  const rows = dateRange("2026-08-01", "2026-08-09");
  const result = analyzeTrendHistory(rows, 7, "2026-08-11");

  assert.equal(result.anchorDate, "2026-08-11");
  assert.equal(result.latestDataDate, "2026-08-09");
  assert.equal(result.staleDays, 2);
  assert.equal(result.calendar.at(-1).date, "2026-08-11");
  assert.equal(result.calendar.at(-1).pm25, null);
});

test("monthly output has exactly 12 buckets and partial YoY uses equal elapsed days", () => {
  const rows = dateRange("2024-08-13", "2026-08-11");
  const result = analyzeTrendHistory(rows, 90, "2026-08-11");

  assert.equal(result.months.length, 12);
  assert.equal(result.months[0].month, "2025-09");
  assert.equal(result.months.at(-1).month, "2026-08");
  assert.equal(result.months.at(-1).expectedDays, 11);
  assert.equal(result.months.at(-1).previousYearExpectedDays, 11);
  assert.equal(result.burning.expectedDays + result.nonBurning.expectedDays, 365);
});

test("trend service ends history at the latest completed Bangkok date", () => {
  const service = readFileSync(
    new URL("../services/daily-summary.service.ts", import.meta.url),
    "utf8",
  );
  assert.match(service, /timeZone:\s*"Asia\/Bangkok"/);
  assert.match(service, /return shiftDateKey\(today, -1\)/);
  assert.match(service, /\.lte\("date", throughDate\)/);
  assert.match(service, /isServiceSupabaseConfigured/);
});
