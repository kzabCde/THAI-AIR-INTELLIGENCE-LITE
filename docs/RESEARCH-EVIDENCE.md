# Research Evidence

The project sources support using temporal history, meteorology, satellite/fire proxies, and spatial context for PM2.5 forecasting. They do not justify labeling the production runtime as native XGBoost or LightGBM when the deployed function only uses feature-importance-weighted surrogate inference.

## Evidence mapping

- Deep-learning satellite PM2.5 estimation motivates adding satellite/remote-sensing variables, but production should disclose missing ground-station limitations.
- Systematic ML review supports comparing classical, machine-learning, and deep-learning models with consistent metrics.
- Satellite-based South Asian air-quality reviews support meteorological and remote-sensing covariates with transparent uncertainty.
- ARIMA-LSTM research motivates hybrid baselines, but only after leakage-safe time splits.
- K-means spatiotemporal work motivates province clustering and neighbour features before model promotion.

## Required promotion checklist

- Reproducible data snapshot with observed/synthetic source flags.
- Rolling-origin validation per province.
- Metrics: MAE, RMSE, R², persistence skill score.
- Error analysis for burning season, missing hours, nulls, outliers, and upstream outages.
