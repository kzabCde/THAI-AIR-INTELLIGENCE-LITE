# PM2.5 Dual-Model Upgrade

> This document describes the v4 transition. Production v5 supersedes its
> six-teacher/Ridge/Logistic training path with pooled LightGBM regression and
> pooled Random Forest classification. See [MODEL-METHODOLOGY.md](./MODEL-METHODOLOGY.md).

## Repository audit

The pre-upgrade system had one active `model_registry` row per province and
served numeric PM2.5 through `api/ml/forecast.py`. Runtime evaluated a portable
Ridge surrogate and wrote numeric rows to `forecast_daily`. Frontend
air-quality levels were derived from the numeric value; there was no
independent classifier, probability vector, or classification metric contract.

This upgrade preserves `training_daily_summary_v2`, strict consecutive-day
targets, chronological evaluation, existing legacy artifact compatibility,
inactive registration, explicit activation, existing forecast read
paths, old-row compatibility, RLS, and service-role-only write RPCs.

| Layer | Before | Upgrade |
|---|---|---|
| Training | Numeric next-day target | Independent regression and classification targets |
| Registry | One active model per province | One active model per province and task |
| Inference | Portable Ridge regression | Portable Ridge + temperature-calibrated portable logistic classification |
| Storage | Numeric PM2.5 | Classes, probabilities, calibrated interval, horizon and fallback evidence |
| API/UI | PM2.5-derived band | Direct class, confidence, probabilities and task metrics |
| Operations | Manual backfill | Manual dry-run/register/forecast dual-model workflow |

## Architecture

The actual next-day PM2.5 value is the regression target. The five-class target
is derived independently from that same actual future value; a regression
prediction is never a classification training target.

Each province evaluates Random Forest, AdaBoost, Gradient Boosting, XGBoost,
LightGBM and CatBoost for both tasks. Regression selection prioritizes positive
Skill Score versus persistence, then MAE and RMSE. Classification selection
prioritizes Macro F1, critical-class Recall and Balanced Accuracy. Accuracy is
reported but never used alone.

## PM2.5 class contract

Version: `thai-pm25-5class-v1`

| Class | PM2.5 (µg/m³) | English | ไทย |
|---:|---:|---|---|
| 1 | 0–15.0 | Very Good | ดีมาก |
| 2 | >15.0–25.0 | Good | ดี |
| 3 | >25.0–37.5 | Moderate | ปานกลาง |
| 4 | >37.5–75.0 | Increased Health Risk | เริ่มมีผลกระทบต่อสุขภาพ |
| 5 | >75.0 | Serious Health Effects | มีผลกระทบต่อสุขภาพอย่างรุนแรง |

Python uses `training/pm25_classes.py`; TypeScript uses
`lib/pm25-classification.ts`. Tests cover 0, 15, 15.01, 25, 25.01, 37.5,
37.51, 75 and 75.01.

## Features and leakage controls

Feature version `daily-observed-v4` contains current PM2.5, 1/3/6/7-day lags,
three/seven-day rolling means, neighboring/regional PM2.5, temperature,
humidity, wind, rain, cyclic day-of-year encoding and calendar/season
indicators. Hotspot and FRP are excluded from the production contract because
the audited historical lineage was predominantly synthetic.

- At least 18 trusted observed hours are required.
- Allowed source defaults to `open-meteo`.
- Target date must be exactly one day after feature date.
- Missing feature/target rows are removed before splitting.
- Train, validation and test partitions remain chronological; five
  expanding-window folds run inside the development period.
- Scaling is fit only on training/development data.
- Ordered features are stored in artifacts and registry metadata.

The production audit on 26 July 2026 found about one year of eligible history.
Class 5 had only 37 province-days across three provinces. A classifier is
therefore ineligible whenever either Class 4 or Class 5 has fewer than five
final-test samples. This cannot be bypassed by the activation override.

## Evaluation and eligibility

Regression stores MAE, RMSE, R², MAPE, sMAPE, Bias, persistence metrics and
Skill Score. These are numeric-error metrics, not classification accuracy.

Classification stores Accuracy, fixed-five-class Macro and Weighted
Precision/Recall/F1, fixed-five-class Balanced Accuracy, Log Loss, Brier score,
expected calibration error, per-class PR-AUC, recall confidence intervals,
support and confusion matrix. Missing Class 4/5 support is an automatic
`insufficient_evidence` failure.

Teacher models and production artifacts are evaluated separately. Selection
compares all six teacher families, then tunes the lightweight artifact on the
chronological validation split:

- Ridge distillation searches regularization strength and a persistence blend.
- Logistic classification searches regularization, partial class weighting,
  temperature scaling and a probability blend with the current-day PM2.5
  class.
- Final eligibility uses the reloaded production artifact's holdout metrics,
  because that artifact—not the heavy teacher—is what Vercel serves.
- Classification promotion requires macro F1, balanced accuracy and weighted
  F1 to beat persistence, so a rare-class gain cannot hide a material loss
  across the majority of forecast days.

Registration never activates. `fn_activate_model_task` validates province,
task, eligibility, feature schema and portable artifact atomically. Existing
`fn_activate_model` remains a regression-only compatibility wrapper.

## Serving and fallback

Default policy: `classifier_with_regression_fallback`.

1. At D+1, use an eligible active classifier and preserve five probabilities.
2. Otherwise derive class from the numeric regression result and state why.
3. At D+2–D+7, always label recursive output as experimental and use the
   regression threshold rather than presenting an unvalidated classifier.
4. If the regressor is absent, explicitly ineligible, a retired
   `persist-revert-v2` row, or its portable artifact fails validation, use
   `recent-mean-v1`: the arithmetic mean of the latest seven trusted observed
   daily PM2.5 values.
5. The mean fallback has no ML run ID, sets
   `fallback_reason=mean_regression_fallback`, and derives the displayed class
   from that numeric mean.

The database/API preserve classifier class, regression-derived class and
`class_agreement`; disagreement is never hidden. An ineligible training run is
never presented as an ML forecast, while activation remains atomic and does not
delete the previous registry history.

## Artifacts

```text
training/artifacts/<run_id>/<province_id>/
  regression/
    model.joblib
    metadata.json
    feature_schema.json
  classification/
    model.joblib
    metadata.json
    feature_schema.json
    class_mapping.json
```

Saved models are immediately reloaded for a sample prediction. Native artifacts
are uploaded to a private bucket with SHA-256 and dependency metadata.
Production uses compact portable artifacts in `model_params`; private paths are
not exposed.

## API and frontend

`GET /api/forecast?province=TH-30` remains backward compatible and adds class
labels, confidence, five probabilities, task-specific active models and
metrics, consistency, fallback evidence, data freshness and feature version.
Old forecast rows are mapped through deterministic thresholds at read time.

The Forecast page shows a primary result card, probability bars, both model
names, regression/classification metrics and fallback/agreement states. The
System page lists active regression and classification models per province.

## Operations

Use **Actions → PM2.5 Dual-Model Pipeline → Run workflow**.

1. Run `mode=dry-run`, `activate=false`, `run_forecast=false`.
2. Inspect `run_summary.json` and artifacts.
3. Apply the migration to staging and run SQL contract/query-plan tests.
4. Run `mode=register`, `activate=false`; inspect eligibility reasons.
5. Only after review, run `mode=register`, `activate=true`.
6. Generate forecasts and verify API/UI output.

`forecast-only` skips training and uses currently active models. Forecast
generation runs only after successful training or an explicit skip.

Both Colab notebook entry points now run the same pooled LightGBM + Random
Forest pipeline, default to `REGISTER=False` and `ACTIVATE=False`, clone an
immutable approved commit SHA, and require the promotion cell to be changed
deliberately. The former `train_all_6_models_pm25.ipynb` path is retained only
as a compatibility alias; it no longer trains six model families. Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`ML_FORECAST_URL`, and `ML_SECRET`. Secret values are never printed.

## Production checklist

- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`
- `python -m pytest -q tests_py`
- `python -m compileall -q api training`
- validate notebook JSON and all Python cells
- apply migration on staging
- run `supabase/tests/dual_model_contract.sql`
- run `supabase/tests/research_hardening_v4_contract.sql`
- inspect Supabase security/performance advisors
- run one-province training dry-run
- verify probability sums and fallback cases
- verify old forecast rows render
- verify no secret or private artifact path reaches browser output

## Rollback

`supabase/rollback/20260724134401_dual_regression_classification_pm25.sql`
deactivates classifiers and restores the one-active-regression-per-province
rule without deleting rows or forecast history.

Application rollback: stop the dual workflow, run operational rollback SQL,
redeploy the previous app version, then regenerate forecasts from retained
active regression models.

## Known limitations

- The source is daily, so the trained target is next-day PM2.5.
- Heavy teachers stay in job/Colab artifacts; Vercel serves validated portable
  surrogates to preserve cold-start limits.
- Station, satellite/AOD, multi-year and national pooled-model tables/tracks do
  not imply that those sources are already ingested or validated.
