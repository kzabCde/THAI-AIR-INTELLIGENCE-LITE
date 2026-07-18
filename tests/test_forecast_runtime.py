import importlib.util
import math
import unittest
from datetime import date
from pathlib import Path

import numpy as np


MODULE_PATH = Path(__file__).parents[1] / "api" / "ml" / "forecast.py"
SPEC = importlib.util.spec_from_file_location("forecast_runtime", MODULE_PATH)
forecast = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(forecast)


class ForecastRuntimeCompatibilityTests(unittest.TestCase):
    def setUp(self):
        self.rolling = [10.0, 11.0, 12.0, 13.0, 14.0, 15.0, 16.0]
        self.last_row = {
            "pm25_mean": 16.0,
            "neighbor_pm25_avg": 15.0,
            "regional_pm25_avg": 14.0,
            "temp_mean": 28.0,
            "humidity_mean": 70.0,
            "wind_speed_mean": 2.0,
            "precip_total": 0.0,
            "hotspot_count": 1.0,
            "total_frp": 2.0,
        }
        self.feature_date = date(2026, 7, 18)
        self.features = forecast.build_feature_vector(
            self.last_row,
            self.rolling,
            self.feature_date,
            forecast.FEATURE_COLS,
        )

    def predict(self, model_name, params, base_models=None):
        return forecast._predict_model(
            model_name,
            params,
            self.features,
            self.rolling,
            province_id="TH-30",
            last_row=self.last_row,
            feature_date=self.feature_date,
            legacy_base_models=base_models or {},
        )

    def test_legacy_xgboost_artifact_is_evaluated(self):
        result = self.predict("xgboost-v1", {"feature_importance": {"pm25_lag_1d": 1.0}})
        self.assertTrue(math.isfinite(result))
        self.assertGreater(result, 0)

    def test_legacy_stacking_artifact_is_evaluated(self):
        result = self.predict(
            "stacking-v1",
            {"base_model": "lightgbm-v1", "w_persist": 0.3, "w_ml": 0.7},
            {("TH-30", "lightgbm-v1"): {"feature_importance": {"pm25_lag_1d": 1.0}}},
        )
        self.assertTrue(math.isfinite(result))
        self.assertGreater(result, 0)

    def test_v2_surrogate_artifact_is_evaluated(self):
        artifact = {
            "feature_cols": forecast.FEATURE_COLS,
            "coefficients": [0.0] * len(forecast.FEATURE_COLS),
            "scaler_mean": [0.0] * len(forecast.FEATURE_COLS),
            "scaler_scale": [1.0] * len(forecast.FEATURE_COLS),
            "intercept": 17.5,
        }
        result = self.predict("surrogate-v2", {"surrogate": artifact})
        self.assertAlmostEqual(result, 17.5)

    def test_missing_artifact_falls_back_safely(self):
        result = self.predict("surrogate-v2", {})
        self.assertTrue(np.isfinite(result))
        self.assertGreater(result, 0)


if __name__ == "__main__":
    unittest.main()
