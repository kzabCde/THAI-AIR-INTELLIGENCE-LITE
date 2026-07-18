# Model Methodology

This project currently serves PM2.5 forecasts through a lightweight production-safe surrogate. Runtime inference uses persistence-reversion and feature-importance-weighted linear blending from `model_registry`; it does **not** load native XGBoost or LightGBM runtimes in production.

## Production guardrails

- Treat `source = observed` as the default dataset for dashboard analytics, training, validation, and evaluation.
- Exclude `source = synthetic` from production accuracy metrics unless a report explicitly labels the result as synthetic-assisted.
- Split training, validation, and test data by time using rolling-origin evaluation.
- Report MAE, RMSE, R², and skill score versus persistence per province before promoting a new model.

## Baselines to keep reproducible

1. Persistence: next value equals the latest observed PM2.5.
2. Seasonal/persistence-reversion: blend latest PM2.5 toward recent rolling mean.
3. Mean reversion: province-specific PM2.5 returns toward historical mean.

## Candidate research tracks

- ARIMA and SARIMA for transparent univariate temporal baselines.
- LSTM / ARIMA-LSTM for nonlinear temporal dynamics after leakage-safe validation.
- Spatiotemporal models using neighbouring provinces and regional transport features.
- Clustering-assisted province groups before fitting local models.
- Satellite and meteorological feature enrichment where coverage and latency are documented.

## Known limitations

Open-Meteo, FIRMS, province-level aggregation, sparse ground-station coverage, and timezone handling can bias estimates. Business dates should use Asia/Bangkok, while stored timestamps remain UTC.
