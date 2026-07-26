# Model Methodology

The staged upgrade trains numeric regression and five-class classification
independently. See [DUAL-MODEL-UPGRADE.md](./DUAL-MODEL-UPGRADE.md).

This project serves PM2.5 forecasts through lightweight production-safe
artifacts. Training compares Random Forest, AdaBoost, Gradient Boosting,
XGBoost, LightGBM and CatBoost teachers on chronological validation data. It
then tunes a standardized Ridge/persistence serving artifact for regression
and a standardized Logistic/persistence serving artifact for classification.
The classification artifact also tunes class weighting and temperature
scaling. Teacher and serving families are always reported separately.
Runtime evaluates the stored scaler, coefficients, intercept and feature order
from `model_registry`; feature importance is never used as a prediction
coefficient.

## Production guardrails

- Read training and runtime features from `training_daily_summary_v2`, which requires at least 18 trusted non-synthetic hourly PM2.5 values per Bangkok business date.
- Use feature contract `daily-observed-v4`. Synthetic/mock/demo hotspot and FRP values are explicitly excluded until real FIRMS coverage has been backfilled and audited.
- Exclude `synthetic`, `mock`, and `demo` sources from production accuracy metrics.
- Select teachers and serving-artifact tuning only on chronological validation data, run five expanding-window folds inside the development period, and reserve the final 20% (at least 30 rows) as an untouched final test.
- Report teacher metrics separately from the serving artifact's MAE, RMSE, R², skill, classification metrics and persistence baseline.
- Calculate five-class macro metrics with the fixed label set `[1,2,3,4,5]`. Missing Class 4 or 5 evidence is a hard `insufficient_evidence` state, not a warning.
- Require classifiers to beat persistence on fixed-five-class macro F1, balanced accuracy and weighted F1; also store per-class recall confidence intervals, PR-AUC, Brier score and expected calibration error.
- Register candidates as inactive. Promotion requires an explicit `fn_activate_model_task` call. Regression requires at least 5% skill versus current-day persistence; classification additionally requires at least five final-test samples in both Classes 4 and 5.
- Determine promotion from the production artifact's final-holdout metrics, not from an unserved teacher score.
- Treat only D+1 as validated by this target contract. D+2–D+7 are recursive experiments and must be labelled accordingly.

## Baselines to keep reproducible

1. Persistence: next value equals the latest observed PM2.5.
2. Seven-day seasonal-naive: use the value from the corresponding weekly lag.
3. SARIMAX `(1,0,1)×(1,0,1,7)`: transparent weekly-seasonal research baseline.
4. Seasonal/persistence-reversion: blend latest PM2.5 toward recent rolling mean.

## Training and promotion

```bash
pip install -r training/requirements.txt
python training/train_dual_models.py --dry-run --province TH-30
python training/train_dual_models.py --register            # inactive candidates
python training/train_dual_models.py --register --activate # eligible candidates only
```

Native teacher artifacts and run manifests are written under
`training/artifacts/` and are intentionally ignored by Git. Registration first
uploads the native artifact to the private `model-artifacts` bucket using an
immutable run/province/task path. The registry stores its URI, SHA-256,
dependency versions, teacher/serving families and portable-artifact checksum.
Regression intervals use P10/P50/P90 residuals calibrated from expanding-window
out-of-fold predictions.

## Candidate research tracks

- LSTM / ARIMA-LSTM for nonlinear temporal dynamics after leakage-safe validation.
- Spatiotemporal models using neighbouring provinces and regional transport features.
- Clustering-assisted province groups before fitting local models.
- Satellite and meteorological feature enrichment where coverage and latency are documented.

## Known limitations

Open-Meteo/CAMS, province-level aggregation, sparse ground-station coverage,
short history and timezone handling can bias estimates. The station schema is
ready, but no source is labelled as ground truth until station identity,
instrument/source provenance and QC eligibility are populated. Business dates
use Asia/Bangkok while stored timestamps remain UTC.
