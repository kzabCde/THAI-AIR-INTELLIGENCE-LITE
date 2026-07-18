import unittest
import sys
import types
from types import SimpleNamespace

import numpy as np

# Unit tests exercise pure inference logic and do not open a Supabase connection.
supabase_stub = types.ModuleType("supabase")
supabase_stub.Client = object
supabase_stub.create_client = lambda *_args, **_kwargs: None
sys.modules["supabase"] = supabase_stub

from api.ml.forecast import (
    FEATURE_COLS,
    _parse_horizon,
    _predict_model,
    build_feature_vector,
    evaluate_surrogate,
    load_active_models,
)


class QueryStub:
    def __init__(self, rows):
        self.rows = rows

    def table(self, _name):
        return self

    def select(self, _columns):
        return self

    def eq(self, _column, _value):
        return self

    def execute(self):
        return SimpleNamespace(data=self.rows)


class ForecastTests(unittest.TestCase):
    def test_horizon_validation(self):
        self.assertEqual(_parse_horizon({"horizon": "7"}), 7)
        for invalid in (True, 0, 15, 1.5, "seven"):
            with self.assertRaises(ValueError):
                _parse_horizon({"horizon": invalid})

    def test_duplicate_active_models_fail_closed(self):
        rows = [
            {"province_id": "TH-30", "model_name": "a"},
            {"province_id": "TH-30", "model_name": "b"},
        ]
        with self.assertRaisesRegex(RuntimeError, "multiple active models"):
            load_active_models(QueryStub(rows))

    def test_surrogate_uses_scaler_and_intercept(self):
        artifact = {
            "feature_cols": ["a", "b"],
            "coefficients": [2.0, -1.0],
            "intercept": 5.0,
            "scaler_mean": [10.0, 4.0],
            "scaler_scale": [2.0, 2.0],
        }
        self.assertAlmostEqual(evaluate_surrogate(np.array([12.0, 6.0]), artifact), 6.0)

    def test_feature_vector_uses_current_day_as_persistence(self):
        rolling = [10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0]
        vector = build_feature_vector({}, rolling, __import__("datetime").date(2026, 7, 18), FEATURE_COLS)
        values = dict(zip(FEATURE_COLS, vector))
        self.assertEqual(values["pm25_mean"], 80.0)
        self.assertEqual(values["pm25_lag_1d"], 70.0)
        self.assertEqual(values["pm25_lag_3d"], 50.0)
        self.assertEqual(values["pm25_lag_7d"], 10.0)

    def test_stacking_uses_declared_current_day_baseline(self):
        artifact = {
            "feature_cols": ["pm25_mean"],
            "coefficients": [0.0],
            "intercept": 100.0,
            "scaler_mean": [0.0],
            "scaler_scale": [1.0],
        }
        params = {
            "surrogate": artifact,
            "stacking": {
                "baseline": "persistence-current-day",
                "intercept": 0.0,
                "w_persist": 1.0,
                "w_surrogate": 0.0,
            },
        }
        self.assertEqual(_predict_model("stacking-v2", params, np.array([25.0]), [10.0, 25.0]), 25.0)


if __name__ == "__main__":
    unittest.main()
