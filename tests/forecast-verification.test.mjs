import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const js = ts.transpileModule(readFileSync(new URL('../lib/forecast-verification.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const compiled = { exports: {} };
new Function('module', 'exports', js)(compiled, compiled.exports);
const { summarizeVerifications, classificationMetrics, parseVerificationFilters } = compiled.exports;
const row = (patch = {}) => ({
  id: 1, status: 'final', predicted: 10, actual: 14, hours_available: 24,
  actual_source: 'open-meteo', model_name: 'lightgbm', model_run_id: 'run-a',
  classification_source: 'active_classifier', classifier_predicted_class: 1,
  interval_covered: true, ...patch,
});

test('metrics separate sources, training runs, classifier and threshold predictions', () => {
  const result = summarizeVerifications([
    row(), row({ predicted: 20, actual: 16, model_run_id: 'run-b', classification_source: 'regression_threshold' }),
    row({ actual_source: 'air4thai', actual: 90 }),
    row({ actual_source: 'air4thai,open-meteo', actual: 90 }),
    row({ status: 'legacy', actual: 90 }), row({ status: 'pending', actual: 90 }),
    row({ hours_available: 17 }), row({ actual: null }), row({ actual: NaN }),
  ], 'open-meteo');
  assert.equal(result.n, 2);
  assert.equal(result.mae, 4);
  assert.equal(result.rmse, 4);
  assert.equal(result.bias, 0);
  assert.equal(result.models.length, 2);
  assert.equal(result.classifier.n, 1);
  assert.equal(result.threshold.n, 2);
});

test('empty samples are unavailable, not zero error or 100% accuracy', () => {
  const result = summarizeVerifications([], 'open-meteo');
  assert.equal(result.n, 0);
  assert.equal(result.mae, null);
  assert.equal(result.rmse, null);
  assert.equal(result.classifier.accuracy, null);
  assert.equal(result.classifier.macroF1, null);
});

test('confusion metrics expose absent critical classes and zero recall', () => {
  const metrics = classificationMetrics([[1,1], [1,1], [4,1], [5,4]]);
  assert.equal(metrics.n, 4);
  assert.equal(metrics.accuracy, 0.5);
  assert.equal(metrics.classes[3].support, 1);
  assert.equal(metrics.classes[3].recall, 0);
  assert.equal(metrics.classes[4].recall, 0);
  assert.equal(metrics.classes[1].recall, null);
});

test('API accepts only bounded windows and integer D+1 through D+7', () => {
  assert.deepEqual(parseVerificationFilters(new URLSearchParams()), { days: 30, horizon: 1 });
  assert.deepEqual(parseVerificationFilters(new URLSearchParams('days=90&horizon=7')), { days: 90, horizon: 7 });
  for (const query of ['days=365', 'horizon=8', 'horizon=0', 'horizon=1.5', 'days=NaN', 'horizon=01']) {
    assert.equal(parseVerificationFilters(new URLSearchParams(query)), null);
  }
});
