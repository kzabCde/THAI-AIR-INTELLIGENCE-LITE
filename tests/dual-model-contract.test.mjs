import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260724190000_dual_regression_classification_pm25.sql",
    import.meta.url,
  ),
  "utf8",
);
const runtime = readFileSync(new URL("../api/ml/forecast.py", import.meta.url), "utf8");

test("migration supports one active model per province and task", () => {
  assert.match(migration, /unique index[\s\S]+\(province_id, task_type\)/i);
  assert.match(migration, /fn_activate_model_task/);
  assert.match(migration, /eligibility_status/);
  assert.match(migration, /p_allow_ineligible/);
});

test("forecast contract stores direct classification and fallback evidence", () => {
  for (const field of [
    "regression_derived_class",
    "classifier_predicted_class",
    "class_probabilities",
    "class_agreement",
    "classification_source",
    "fallback_reason",
  ]) {
    assert.ok(migration.includes(field), `migration missing ${field}`);
    assert.ok(runtime.includes(field), `runtime missing ${field}`);
  }
});

test("privileged RPCs are not executable by browser roles", () => {
  assert.match(
    migration,
    /revoke all on function public\.fn_activate_model_task[\s\S]+from public, anon, authenticated/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.fn_activate_model_task[\s\S]+to service_role/i,
  );
});
