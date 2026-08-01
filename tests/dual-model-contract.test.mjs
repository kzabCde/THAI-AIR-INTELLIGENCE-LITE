import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260724134401_dual_regression_classification_pm25.sql",
    import.meta.url,
  ),
  "utf8",
);
const hardeningMigration = readFileSync(
  new URL(
    "../supabase/migrations/20260726132707_research_hardening_v4.sql",
    import.meta.url,
  ),
  "utf8",
);
const advisorFollowup = readFileSync(
  new URL(
    "../supabase/migrations/20260726132929_research_hardening_v4_advisor_followup.sql",
    import.meta.url,
  ),
  "utf8",
);
const evaluationLifecycle = readFileSync(
  new URL(
    "../supabase/migrations/20260726133750_forecast_evaluation_lifecycle.sql",
    import.meta.url,
  ),
  "utf8",
);
const productionRemediation = readFileSync(
  new URL(
    "../supabase/migrations/20260730154307_reconcile_runtime_contract_history.sql",
    import.meta.url,
  ),
  "utf8",
);
const evaluatedD1Hotfix = readFileSync(
  new URL(
    "../supabase/migrations/20260728023313_allow_evaluated_d1_reliability.sql",
    import.meta.url,
  ),
  "utf8",
);
const dueEvaluationHotfix = readFileSync(
  new URL(
    "../supabase/migrations/20260728023805_optimize_due_forecast_evaluation.sql",
    import.meta.url,
  ),
  "utf8",
);
const runtime = readFileSync(new URL("../api/ml/forecast.py", import.meta.url), "utf8");
const frontendForecast = readFileSync(
  new URL("../services/forecast.service.ts", import.meta.url),
  "utf8",
);
const systemService = readFileSync(
  new URL("../services/system.service.ts", import.meta.url),
  "utf8",
);
const pooledMigration = readFileSync(
  new URL(
    "../supabase/migrations/20260801052036_pooled_tree_runtime_contract.sql",
    import.meta.url,
  ),
  "utf8",
);
const pooledTrainer = readFileSync(
  new URL("../training/train_pooled_models.py", import.meta.url),
  "utf8",
);
const portableTrees = readFileSync(
  new URL("../api/ml/portable_trees.py", import.meta.url),
  "utf8",
);
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

test("due evaluation reads only auditable missing province-date pairs", () => {
  assert.match(
    dueEvaluationHotfix,
    /forecast\.forecast_run_id is not null/i,
  );
  assert.match(
    dueEvaluationHotfix,
    /not exists[\s\S]+forecast_daily_id = forecast\.id/i,
  );
  assert.match(
    dueEvaluationHotfix,
    /candidate\.target_date::timestamp[\s\S]+at time zone 'Asia\/Bangkok'/i,
  );
  assert.doesNotMatch(
    dueEvaluationHotfix,
    /join public\.training_daily_summary_v2/i,
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
  for (const notebook of [canonical, compatibility]) {
    assert.match(notebook, /training\.train_pooled_models/);
    assert.match(notebook, /LightGBMRegressor/);
    assert.match(notebook, /RandomForestClassifier/);
    assert.match(notebook, /pooled_chronological_split/);
    assert.doesNotMatch(
      notebook,
      /train_province|adaboost|gradient_boosting|xgboost|catboost/i,
    );
  }
  const canonicalNotebook = JSON.parse(canonical);
  const cloneInstallCell = canonicalNotebook.cells.find(
    (cell) => cell.metadata?.id === "clone_install",
  );
  const cloneInstallSource = cloneInstallCell?.source?.join("") ?? "";
  assert.match(cloneInstallSource, /os\.chdir\(["\']\/content["\']\)/);
  assert.match(cloneInstallSource, /shutil\.rmtree/);
  assert.match(cloneInstallSource, /subprocess\.run\([\s\S]*check=True/);
  assert.match(cloneInstallSource, /rev-parse/);
  assert.doesNotMatch(cloneInstallSource, /!rm -rf/);
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

test("v5 trains exactly one pooled family per task", () => {
  assert.match(pooledTrainer, /POOLED_REGRESSION_FAMILY/);
  assert.match(pooledTrainer, /POOLED_CLASSIFICATION_FAMILY/);
  assert.match(pooledTrainer, /LGBMRegressor/);
  assert.match(pooledTrainer, /RandomForestClassifier/);
  assert.doesNotMatch(pooledTrainer, /AdaBoost|XGBRegressor|CatBoost/);
  assert.match(pooledTrainer, /same_date_same_partition/);
  assert.match(pooledTrainer, /embargo_days/);
  assert.match(pooledTrainer, /pooled_walk_forward_folds/);
});

test("v5 runtime loads checksum-verified exact tree artifacts", () => {
  assert.match(runtime, /load_runtime_artifact/);
  assert.match(runtime, /runtime artifact checksum mismatch/);
  assert.match(runtime, /evaluate_lightgbm_regressor/);
  assert.match(runtime, /evaluate_random_forest_classifier/);
  assert.match(portableTrees, /portable-tree-ensemble-v1/);
  assert.doesNotMatch(portableTrees, /Ridge|LogisticRegression/);
});

test("v5 fallback is the explicit recent observed mean", () => {
  assert.match(runtime, /def recent_mean_forecast/);
  assert.match(runtime, /FALLBACK_MODEL_NAME/);
  assert.match(runtime, /mean_regression_fallback/);
  assert.doesNotMatch(runtime, /def persist_revert_forecast/);
  assert.match(frontendForecast, /FORECAST_MODEL = "recent-mean-v1"/);
  assert.match(frontendForecast, /slice\(-7\)/);
  assert.doesNotMatch(frontendForecast, /linregSlope/);
  assert.match(systemService, /usesMeanFallback/);
  assert.match(systemService, /"recent-mean-v1"/);
});

test("portable Random Forest aligns public classes before calibration", () => {
  const alignment = portableTrees.indexOf("public_index =");
  const calibration = portableTrees.indexOf("temperature = float");
  assert.ok(alignment >= 0);
  assert.ok(calibration > alignment);
});

test("v5 migration keeps runtime artifacts private and activation separate", () => {
  assert.match(pooledMigration, /runtime_artifact_uri/);
  assert.match(pooledMigration, /storage:\/\/model-artifacts\//);
  assert.match(pooledMigration, /serving_portable/);
  assert.match(pooledMigration, /experimental_direct/);
  assert.match(
    pooledMigration,
    /revoke all on function public\.fn_upsert_model_registry\(jsonb\)[\s\S]+from public, anon, authenticated/i,
  );
  assert.doesNotMatch(pooledMigration, /fn_activate_model_task\s*\(/);
});
