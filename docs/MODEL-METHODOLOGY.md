# Model Methodology

The staged upgrade trains numeric regression and five-class classification
independently. See [DUAL-MODEL-UPGRADE.md](./DUAL-MODEL-UPGRADE.md).

This project serves PM2.5 forecasts through lightweight production-safe
artifacts. Training compares Random Forest, AdaBoost, Gradient Boosting,
XGBoost, LightGBM and CatBoost teachers on chronological validation data. It
then tunes a standardized Ridge surrogate with a validation-selected
persistence blend for regression, and a regularized standardized Logistic
artifact with validation-selected partial class weighting and a current-day
class probability blend for classification.
Runtime evaluates the stored scaler, coefficients, intercept and feature order
from `model_registry`; feature importance is never used as a prediction
coefficient.

## Production guardrails

- Read training and runtime features from `training_daily_summary_v2`, which requires at least 18 non-synthetic hourly values per Bangkok business date.
- Exclude `synthetic`, `mock`, and `demo` sources from production accuracy metrics.
- Select teachers and production-artifact tuning only on chronological validation data, and reserve the final 20% (at least 30 rows) as an untouched final test.
- Report teacher metrics separately from the production artifact's MAE, RMSE, R², skill, classification metrics and persistence baseline.
- Require classifiers to beat the persistence baseline on macro F1, balanced accuracy and weighted F1.
- Register candidates as inactive. Promotion requires an explicit `fn_activate_model` call and at least 5% skill versus current-day persistence.
- Determine promotion from the production artifact's final-holdout metrics, not from an unserved teacher score.

## Baselines to keep reproducible

1. Persistence: next value equals the latest observed PM2.5.
2. Seasonal/persistence-reversion: blend latest PM2.5 toward recent rolling mean.
3. Mean reversion: province-specific PM2.5 returns toward historical mean.

## Training and promotion

```bash
pip install -r training/requirements.txt
python training/train_models_v2.py                         # local artifacts only
python training/train_models_v2.py --register              # inactive candidates
python training/train_models_v2.py --register --activate   # eligible candidates only
```

Native teacher artifacts and run manifests are written under `training/artifacts/` and are intentionally ignored by Git. The production surrogate, exact final-test metrics, residual P90, run ID, data cutoff, dependency versions, and feature schema are stored in `model_params`.

## Candidate research tracks

- ARIMA and SARIMA for transparent univariate temporal baselines.
- LSTM / ARIMA-LSTM for nonlinear temporal dynamics after leakage-safe validation.
- Spatiotemporal models using neighbouring provinces and regional transport features.
- Clustering-assisted province groups before fitting local models.
- Satellite and meteorological feature enrichment where coverage and latency are documented.

## Known limitations

Open-Meteo, FIRMS, province-level aggregation, sparse ground-station coverage, and timezone handling can bias estimates. Business dates should use Asia/Bangkok, while stored timestamps remain UTC.
