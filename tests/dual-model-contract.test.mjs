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
const hardeningMigration = readFileSync(
  new URL(
    "../supabase/migrations/20260726130615_research_hardening_v4.sql",
    import.meta.url,
  ),
  "utf8",
);
const advisorFollowup = readFileSync(
  new URL(
    "../supabase/migrations/20260726134000_research_hardening_v4_advisor_followup.sql",
    import.meta.url,
  ),
  "utf8",
);
const evaluationLifecycle = readFileSync(
  new URL(
    "../supabase/migrations/20260726142000_forecast_evaluation_lifecycle.sql",
    import.meta.url,
  ),
  "utf8",
);
const productionRemediation = readFileSync(
  new URL(
    "../supabase/migrations/20260727170000_production_audit_remediation.sql",
    import.meta.url,
  ),
  "utf8",
);
const evaluatedD1Hotfix = readFileSync(
  new URL(
    "../supabase/migrations/20260728023020_allow_evaluated_d1_reliability.sql",
    import.meta.url,
  ),
  "utf8",
);
const runtime = readFileSync(new URL("../api/ml/forecast.py", import.meta.url), "utf8");
const vercelConfig = JSON.parse(
  readFileSync(new URL("../vercel.json", import.meta.url), "utf8"),
);

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

test("Vercel bundles the shared PM2.5 classification runtime", () => {
  assert.match(runtime, /from training\.pm25_classes import/);
  const excludeFiles = vercelConfig.functions["api/ml/forecast.py"].excludeFiles;
  assert.doesNotMatch(excludeFiles, /(?:^|[,{}])training(?:[,{}]|$)/);
});

test("v4 hardening blocks synthetic lineage and unsupported classifiers", () => {
  assert.match(
    hardeningMigration,
    /lower\(hd\.source\) not in \('synthetic', 'mock', 'demo'\)/i,
  );
  assert.match(hardeningMigration, /insufficient_evidence_class:4/);
  assert.match(hardeningMigration, /insufficient_evidence_class:5/);
  assert.match(hardeningMigration, /metric_class_contract/);
  assert.match(
    hardeningMigration,
    /classification candidate lacks validated five-class evidence/,
  );
});

test("v4 forecast contract records intervals and horizon reliability", () => {
  for (const field of [
    "pm25_p10_forecast",
    "pm25_p50_forecast",
    "pm25_p90_forecast",
    "horizon_reliability",
    "is_experimental",
    "uncertainty_method",
  ]) {
    assert.ok(hardeningMigration.includes(field), `migration missing ${field}`);
    assert.ok(runtime.includes(field), `runtime missing ${field}`);
  }
});

test("D+1 runtime reliability value is accepted by the database contract", () => {
  assert.match(runtime, /"horizon_reliability":\s*\([\s\S]*"evaluated_d1"/);
  assert.match(
    evaluatedD1Hotfix,
    /forecast_daily_horizon_reliability_check[\s\S]*'evaluated_d1'/,
  );
  assert.match(
    evaluatedD1Hotfix,
    /validate constraint forecast_daily_horizon_reliability_check/i,
  );
});

test("new operational tables are RLS protected and browser roles are revoked", () => {
  for (const table of [
    "stations",
    "station_observations",
    "feature_snapshots",
    "forecast_runs",
    "forecast_evaluations",
    "model_artifacts",
    "model_drift_metrics",
    "pipeline_alerts",
  ]) {
    assert.match(
      hardeningMigration,
      new RegExp(`alter table public\\.${table} enable row level security`, "i"),
    );
  }
  assert.match(
    hardeningMigration,
    /revoke all on table[\s\S]+from public, anon, authenticated/i,
  );
  for (const fn of [
    "fn_record_pipeline_alert",
    "fn_resolve_pipeline_alert",
  ]) {
    assert.match(hardeningMigration, new RegExp(`create or replace function public\\.${fn}`));
    assert.match(
      hardeningMigration,
      new RegExp(`revoke all on function public\\.${fn}[\\s\\S]+from public, anon, authenticated`, "i"),
    );
  }
});

test("advisor follow-up documents service-only RLS and covers stations FK", () => {
  assert.match(advisorFollowup, /idx_stations_province_id/);
  assert.match(advisorFollowup, /for all to service_role using \(true\) with check \(true\)/i);
  assert.doesNotMatch(advisorFollowup, /to anon|to authenticated/i);
});

test("Colab entry points default to safe non-production behavior", () => {
  const canonical = readFileSync(
    new URL("../training/train_dual_models_pm25.ipynb", import.meta.url),
    "utf8",
  );
  const compatibility = readFileSync(
    new URL("../training/train_all_6_models_pm25.ipynb", import.meta.url),
    "utf8",
  );
  const legacy = readFileSync(
    new URL("../training/train_xgb_lgbm.ipynb", import.meta.url),
    "utf8",
  );
  for (const notebook of [canonical, compatibility]) {
    assert.match(notebook, /REGISTER = False/);
    assert.match(notebook, /ACTIVATE = False/);
    assert.match(notebook, /APPROVED_CODE_SHA/);
  }
  assert.match(legacy, /DEPRECATED/);
  assert.match(legacy, /REGISTER=False; ACTIVATE=False/);
  assert.match(legacy, /raise RuntimeError\(\\"Deprecated notebook/);
});

test("forecast batches are linked to runs and evaluated against trusted actuals", () => {
  assert.match(evaluationLifecycle, /forecast_run_id uuid/);
  assert.match(evaluationLifecycle, /fn_evaluate_due_forecasts/);
  assert.match(evaluationLifecycle, /training_daily_summary_v2/);
  assert.match(
    evaluationLifecycle,
    /revoke all on function public\.fn_evaluate_due_forecasts\(\)[\s\S]+from public, anon, authenticated/i,
  );
  assert.match(runtime, /def execute_forecast_run/);
  assert.match(runtime, /evaluated_previous_rows/);
});

test("production remediation prevents fallback overwrite and records drift", () => {
  assert.doesNotMatch(
    productionRemediation.slice(
      productionRemediation.indexOf("create or replace function public.fn_daily_pipeline"),
    ),
    /fn_generate_forecast\(/,
  );
  assert.match(productionRemediation, /fn_refresh_model_drift_metrics/);
  assert.match(productionRemediation, /trusted_daily_metrics_v1/);
  assert.match(productionRemediation, /observed_hotspot_daily_v1/);
  assert.match(productionRemediation, /idx_aqh_trusted_latest/);
  assert.match(productionRemediation, /idx_wh_trusted_latest/);
});

test("technical operations tables are service-role only", () => {
  for (const table of ["cron_log", "model_registry", "sync_state"]) {
    assert.match(
      productionRemediation,
      new RegExp(`revoke all privileges on table public\\.${table}[\\s\\S]+from anon, authenticated`, "i"),
    );
  }
});
