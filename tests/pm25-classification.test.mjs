import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(
  new URL("../lib/pm25-classification.ts", import.meta.url),
  "utf8",
);
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const compiledModule = { exports: {} };
new Function("module", "exports", js)(compiledModule, compiledModule.exports);

const { pm25ClassForValue, normalizeClassProbabilities } = compiledModule.exports;

test("PM2.5 five-class boundaries match the project specification", () => {
  const cases = [
    [0, 1], [15, 1], [15.01, 2], [25, 2], [25.01, 3],
    [37.5, 3], [37.51, 4], [75, 4], [75.01, 5],
  ];
  for (const [value, expected] of cases) {
    assert.equal(pm25ClassForValue(value), expected);
  }
});

test("class probabilities are validated and normalized", () => {
  const values = normalizeClassProbabilities({ 1: 1, 2: 1, 3: 2, 4: 4, 5: 2 });
  assert.ok(values);
  assert.ok(Math.abs(Object.values(values).reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.equal(normalizeClassProbabilities({ 1: -1 }), null);
});
