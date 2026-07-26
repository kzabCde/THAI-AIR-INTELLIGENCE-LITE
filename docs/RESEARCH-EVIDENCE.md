# Research Evidence

The project sources support using temporal history, meteorology, satellite/fire proxies, and spatial context for PM2.5 forecasting. They do not justify labeling the production runtime as native XGBoost or LightGBM when the deployed function only uses feature-importance-weighted surrogate inference.

## Evidence mapping

- Bangkok five-year forecasting supports short-horizon use, three-day rolling
  features and cyclic calendar encoding; it also shows material degradation
  from D+1 toward D+7. This is why only D+1 is presented as validated.
- Bangkok time-series analysis supports a weekly-seasonal SARIMA/SARIMAX
  baseline alongside persistence.
- Thailand-wide PM2.5 forecasting supports spatial hotspot buffers, but not
  synthetic province totals. Hotspot/FRP remain excluded until real,
  multi-year FIRMS lineage is available.
- Greater Bangkok and Northern Thailand comparisons support evaluating strong
  tree models before defaulting to deep learning, especially on small daily
  datasets.
- Deep-learning satellite PM2.5 estimation and South Asian reviews motivate
  AOD, PBLH, radiation, vegetation, elevation and population features only
  after coverage, latency, provenance and ground-station validation exist.
- ARIMA-LSTM and clustering-spatiotemporal research remain research tracks
  until there is leakage-safe temporal/external-province validation.
- Dataset-dependent forecasting comparisons support retaining multiple model
  families and selecting on the actual dataset rather than assuming LSTM or a
  Transformer is best.

## Required promotion checklist

- Reproducible feature snapshot with per-source observed/synthetic lineage.
- Five-fold expanding-window validation plus an untouched final holdout.
- Regression metrics by horizon/season/AQI band: MAE, RMSE, R², bias,
  persistence and seasonal-naive skill, interval coverage.
- Classification metrics with fixed labels 1–5: per-class recall/PR-AUC,
  Macro F1, Brier score, ECE and confidence intervals.
- External-province validation before promoting pooled regional/national models.
- Error analysis for burning season, missing hours, nulls, outliers, drift and
  upstream outages.

## Current evidence boundary

The current production dataset covers 20 Northeastern provinces and roughly
one year of eligible daily rows. The database now has station, provenance,
evaluation, artifact and drift contracts, but those tables are readiness
infrastructure—not evidence that ground stations, satellites, nationwide
history or calibrated D+7 forecasts already exist.
