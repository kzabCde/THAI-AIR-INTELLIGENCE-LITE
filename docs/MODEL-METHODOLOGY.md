# Model Methodology

The staged upgrade trains numeric regression and five-class classification
independently. See [DUAL-MODEL-UPGRADE.md](./DUAL-MODEL-UPGRADE.md).

Production v5 uses exactly two machine-learning families with one fixed role
each: pooled `LightGBMRegressor` for numeric PM2.5 and pooled
`RandomForestClassifier` for the five public air-quality classes. The tasks use
the same observed source rows but independent targets and promotion gates.

Both models are trained across all 20 provinces with province one-hot identity,
coordinates and direct forecast horizon D+1 through D+7. Runtime downloads a
checksum-verified gzip JSON artifact from the private `model-artifacts` bucket
and evaluates the original tree splits/leaves. Ridge/Logistic and the six-model
trainer remain readable only as rollback/legacy paths; they are not candidates
in the v5 workflow.

## Production guardrails

- Read training and runtime features from `training_daily_summary_v2`, which requires at least 18 trusted non-synthetic hourly PM2.5 values per Bangkok business date.
- Use feature contract `daily-observed-v4`. Synthetic/mock/demo hotspot and FRP values are explicitly excluded until real FIRMS coverage has been backfilled and audited.
- Exclude `synthetic`, `mock`, and `demo` sources from production accuracy metrics.
- Keep all provinces from the same origin date in the same partition and purge seven dates between train/validation/test so a D+7 training target cannot overlap the next partition.
- Select hyperparameters only on chronological validation data and reserve the latest 20% (at least 30 unique dates) as an untouched final test.
- Report D+1 activation metrics separately from the experimental direct D+2-D+7 metrics and from persistence/seasonal-naive baselines.
- Calculate five-class macro metrics with the fixed label set `[1,2,3,4,5]`. Missing Class 4 or 5 evidence is a hard `insufficient_evidence` state, not a warning.
- Require classifiers to beat persistence on fixed-five-class macro F1, balanced accuracy and weighted F1; also store per-class recall confidence intervals, PR-AUC, Brier score and expected calibration error.
- Register candidates as inactive. Promotion requires an explicit `fn_activate_model_task` call. Regression requires at least 5% skill versus current-day persistence; classification additionally requires at least five final-test samples in both Classes 4 and 5.
- Determine promotion from the exact portable tree artifact's final-holdout metrics, checked against native library output before upload.
- Treat only D+1 as production-evaluated. D+2-D+7 are direct-horizon experiments and are labelled `experimental_direct` until enough retrospective evidence accumulates.

## Baselines to keep reproducible

1. Persistence: next value equals the latest observed PM2.5.
2. Seven-day seasonal-naive: use the value from the corresponding weekly lag.
3. SARIMAX `(1,0,1)×(1,0,1,7)`: transparent weekly-seasonal research baseline.
4. Seasonal/persistence-reversion: blend latest PM2.5 toward recent rolling mean.

## Training and promotion

```bash
pip install -r training/requirements.txt
python -m training.train_pooled_models --dry-run
python -m training.train_pooled_models --shadow
python -m training.train_pooled_models --register
python -m training.train_pooled_models --register --activate # eligible tasks/provinces only
```

Native model artifacts, exact portable tree artifacts and run manifests are written under
`training/artifacts/` and are intentionally ignored by Git. Registration first
uploads both artifacts to the private `model-artifacts` bucket using an
immutable run/pooled/task path. The registry stores both URIs and SHA-256
digests, dependency versions, feature order and actual serving family.
Regression intervals use P10/P50/P90 residuals calibrated by chronological
validation and stored separately for each direct horizon.

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
