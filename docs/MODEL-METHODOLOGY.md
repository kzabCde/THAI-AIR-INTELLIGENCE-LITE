# Model Methodology

The staged upgrade trains numeric regression and five-class classification
independently. See [DUAL-MODEL-UPGRADE.md](./DUAL-MODEL-UPGRADE.md).

Production runtime v5.6.2 uses exactly two machine-learning families with one
fixed role each: one province-local residual `LightGBMRegressor` per province
for numeric PM2.5 and one pooled `RandomForestClassifier` for the five public
air-quality classes. The tasks use the same observed source rows but independent
targets and promotion gates.

The residual regressor learns a correction to the current-day persistence value
inside each province. Its correction weight is selected on D+1 validation data,
then multiplied by a fixed 0.90 conservative shrinkage before the untouched test
is evaluated. Classification is trained once across all 20 provinces with
province one-hot identity, coordinates and direct forecast horizon D+1 through
D+7. Runtime downloads checksum-verified gzip JSON artifacts from the private
`model-artifacts` bucket and evaluates the original tree splits/leaves plus the
declared residual transform. Ridge/Logistic and the six-model trainer remain
readable only as rollback/legacy paths; they are not candidates in this workflow.

## Production guardrails

- Read training and runtime features from `training_daily_summary_v2`, which requires at least 18 trusted non-synthetic hourly PM2.5 values per Bangkok business date.
- Use feature contract `daily-observed-v4`. Synthetic/mock/demo hotspot and FRP values are explicitly excluded until real FIRMS coverage has been backfilled and audited.
- Exclude `synthetic`, `mock`, and `demo` sources from production accuracy metrics.
- Keep all provinces from the same origin date in the same partition and purge seven dates between train/validation/test so a D+7 training target cannot overlap the next partition.
- Select hyperparameters only on a fixed 365-origin-date chronological Validation window and reserve the latest 365 origin dates as untouched Test evidence, with a seven-day embargo on both boundaries. This requires at least 834 unique origin dates: 90 Train + 365 Validation + 365 Test + 14 purged dates.
- Report D+1 activation metrics separately from the experimental direct D+2-D+7 metrics and from persistence/seasonal-naive baselines.
- Calculate five-class macro metrics with the fixed label set `[1,2,3,4,5]`. Missing Class 4 or 5 evidence is a hard `insufficient_evidence` state, not a warning.
- Require classifiers to beat persistence on fixed-five-class macro F1, balanced accuracy and weighted F1; also store per-class recall confidence intervals, PR-AUC, Brier score and expected calibration error.
- Register candidates as inactive. Regression requires at least 4.5% skill versus current-day persistence globally and in every province; classification additionally requires at least five final-test samples in both Classes 4 and 5.
- Promote all 40 task/province rows with one `fn_activate_pooled_dual_model_run` transaction so a regression or classification preflight failure rolls back both task promotions.
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
uploads native and portable artifacts to the private `model-artifacts` bucket using immutable
run/province/regression paths and one run/pooled/classification path. The
registry stores both URIs and SHA-256
digests, dependency versions, feature order and actual serving family.
Regression intervals use province-local P10/P50/P90 residuals calibrated by
chronological validation and stored separately for each direct horizon.

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
