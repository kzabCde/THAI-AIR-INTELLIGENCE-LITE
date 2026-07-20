import importlib.util
from datetime import date
from pathlib import Path

import numpy as np
import pytest

spec = importlib.util.spec_from_file_location("ml_forecast", Path("api/ml/forecast.py"))
ml = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ml)


def surrogate_artifact():
    size = len(ml.FEATURE_COLS)
    return {
        "feature_cols": ml.FEATURE_COLS,
        "coefficients": [2.0] + [0.0] * (size - 1),
        "intercept": 10.0,
        "scaler_mean": [5.0] + [0.0] * (size - 1),
        "scaler_scale": [5.0] + [1.0] * (size - 1),
    }


def test_standardized_surrogate_uses_scaler_and_coefficients():
    features = np.asarray([15.0] + [0.0] * (len(ml.FEATURE_COLS) - 1))
    assert ml.evaluate_surrogate(features, surrogate_artifact()) == 14.0


def test_ensemble6_uses_registered_runtime_surrogate():
    features = np.asarray([15.0] + [0.0] * (len(ml.FEATURE_COLS) - 1))
    prediction = ml._predict_model(
        ml.ENSEMBLE6_MODEL,
        {"surrogate": surrogate_artifact()},
        features,
        [10.0, 15.0],
    )
    assert prediction == 14.0


def test_unknown_model_falls_back_to_persist_revert():
    rolling = [10.0, 20.0, 40.0]
    features = np.zeros(len(ml.FEATURE_COLS))
    expected = ml.persist_revert_forecast(rolling, h=1)
    assert ml._predict_model("unknown", {}, features, rolling) == expected


def test_duplicate_active_models_are_rejected():
    class Query:
        def select(self, *_args): return self
        def eq(self, *_args): return self
        def execute(self):
            return type("Resp", (), {"data": [
                {"province_id": "TH-30", "model_name": "new", "model_params": {}},
                {"province_id": "TH-30", "model_name": "old", "model_params": {}},
            ]})()

    class SB:
        def table(self, name):
            assert name == "model_registry"
            return Query()

    with pytest.raises(RuntimeError, match="multiple active models"):
        ml.load_active_models(SB())


def test_forecast_origin_uses_feature_date_not_runtime_today():
    row = {"date": "2026-02-01", "pm25_mean": 25, "temp_mean": 30, "humidity_mean": 60}
    feature_date = date.fromisoformat(row["date"]) + ml.timedelta(days=1)
    fvec = ml.build_feature_vector(row, [20, 25], feature_date, ml.FEATURE_COLS)
    assert fvec[ml.FEATURE_COLS.index("month")] == 2
    assert fvec[ml.FEATURE_COLS.index("day_of_week")] == 0
