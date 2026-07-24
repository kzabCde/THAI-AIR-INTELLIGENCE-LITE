# PM2.5 Dual-Model Upgrade

## Repository audit

The pre-upgrade system had one active `model_registry` row per province and
served numeric PM2.5 through `api/ml/forecast.py`. Runtime evaluated a portable
Ridge surrogate and wrote numeric rows to `forecast_daily`. Frontend
air-quality levels were derived from the numeric value; there was no
independent classifier, probability vector, or classification metric contract.

This upgrade preserves `training_daily_summary_v2`, strict consecutive-day
targets, chronological evaluation, existing `ensemble6-pm25-v3` and persistence
inference, inactive registration, explicit activation, existing forecast read
paths, old-row compatibility, RLS, and service-role-only write RPCs.

| Layer | Before | Upgrade |
|---|---|---|
| Training | Numeric next-day target | Independent regression and classification targets |
| Registry | One active model per province | One active model per province and task |
| Inference | Portable Ridge regression | Portable Ridge + portable logistic classification |
| Storage | Numeric PM2.5 | Both classes, probabilities, agreement and fallback evidence |
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

Feature version `daily-observed-v3` contains current PM2.5, 1/3/7-day lags,
seven-day rolling mean, neighboring/regional PM2.5, temperature, humidity,
wind, rain, hotspots, FRP and calendar/season indicators. All are available at
forecast origin.

- At least 18 trusted observed hours are required.
- Allowed source defaults to `open-meteo`.
- Target date must be exactly one day after feature date.
- Missing feature/target rows are removed before splitting.
- Train, validation and test partitions remain chronological.
- Scaling is fit only on training/development data.
- Ordered features are stored in artifacts and registry metadata.

The read-only production audit on 24 July 2026 found 368 strict consecutive-day
rows per province (19 July 2025–22 July 2026). Class 5 was absent in 17 of 20
provinces and sparse in two others; only TH-38 and TH-43 had material Class 5
support. This is why absent critical-class support is recorded as a warning
rather than automatically failing a province.

## Evaluation and eligibility

Regression stores MAE, RMSE, R², MAPE, sMAPE, Bias, persistence metrics and
Skill Score. These are numeric-error metrics, not classification accuracy.

Classification stores Accuracy, Macro and Weighted Precision/Recall/F1,
Balanced Accuracy, Log Loss, per-class metrics/support and confusion matrix.
Missing Class 4/5 support in a small test is a warning, not an automatic
failure. With sufficient support, critical-class Recall gates apply.

Registration never activates. `fn_activate_model_task` validates province,
task, eligibility, feature schema and portable artifact atomically. Existing
`fn_activate_model` remains a regression-only compatibility wrapper.

## Serving and fallback

Default policy: `classifier_with_regression_fallback`.

1. Use an eligible active classifier and preserve five probabilities.
2. Otherwise derive class from the numeric regression result.
3. If no active regressor exists, use the persistence fallback.

The database/API preserve classifier class, regression-derived class and
`class_agreement`; disagreement is never hidden.

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

Saved models are immediately reloaded for a sample prediction. Production uses
compact portable artifacts in `model_params`; private paths are not exposed.

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
5. Only after approval, run `mode=register`, `activate=true`.
6. Generate forecasts and verify API/UI output.

`forecast-only` skips training and uses currently active models. Forecast
generation runs only after successful training or an explicit skip.

Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ML_FORECAST_URL`, and
`ML_SECRET`. Secret values are never printed.

## Production checklist

- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`
- `python -m pytest -q tests_py`
- `python -m compileall -q api training`
- validate notebook JSON and all Python cells
- apply migration on staging
- run `supabase/tests/dual_model_contract.sql`
- inspect Supabase security/performance advisors
- run one-province training dry-run
- verify probability sums and fallback cases
- verify old forecast rows render
- verify no secret or private artifact path reaches browser output

## Rollback

`supabase/rollback/20260724190000_dual_regression_classification_pm25.sql`
deactivates classifiers and restores the one-active-regression-per-province
rule without deleting rows or forecast history.

Application rollback: stop the dual workflow, run operational rollback SQL,
redeploy the previous app version, then regenerate forecasts from retained
active regression models.

## Known limitations

- The source is daily, so the trained target is next-day PM2.5.
- Heavy teachers stay in job/Colab artifacts; Vercel serves validated portable
  surrogates to preserve cold-start limits.
- This pull request does not activate classifiers, apply production migration,
  merge itself, or deploy production.
