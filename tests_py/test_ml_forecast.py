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


def test_standardized_surrogate_can_blend_with_persistence():
    features = np.asarray([15.0] + [0.0] * (len(ml.FEATURE_COLS) - 1))
    artifact = {
        **surrogate_artifact(),
        "model_weight": 0.25,
        "persistence_feature": "pm25_mean",
    }
    assert ml.evaluate_surrogate(features, artifact) == pytest.approx(14.75)


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


def test_portable_classifier_returns_five_normalized_probabilities():
    size = len(ml.FEATURE_COLS)
    artifact = {
        "threshold_version": ml.THRESHOLD_VERSION,
        "feature_cols": ml.FEATURE_COLS,
        "classes": [1, 3, 5],
        "coefficients": [
            [0.0] * size,
            [0.1] + [0.0] * (size - 1),
            [-0.1] + [0.0] * (size - 1),
        ],
        "intercepts": [0.0, 0.2, -0.2],
        "scaler_mean": [0.0] * size,
        "scaler_scale": [1.0] * size,
    }
    probabilities = ml.evaluate_portable_classifier(
        np.ones(size),
        artifact,
    )
    assert set(probabilities) == {"1", "2", "3", "4", "5"}
    assert sum(probabilities.values()) == pytest.approx(1.0)
    assert probabilities["2"] == 0
    assert probabilities["4"] == 0


def test_portable_classifier_rejects_threshold_version_mismatch():
    with pytest.raises(ValueError, match="schema"):
        ml.evaluate_portable_classifier(
            np.zeros(len(ml.FEATURE_COLS)),
            {"threshold_version": "wrong"},
        )


def _forecast_sb(include_classifier=True):
    size = len(ml.FEATURE_COLS)
    active = [{
        "province_id": "TH-30",
        "task_type": "regression",
        "model_name": "gradient-boosting-regressor",
        "run_id": "11111111-1111-4111-8111-111111111111",
        "model_params": {
            "surrogate": {
                "feature_cols": ml.FEATURE_COLS,
                "coefficients": [0.0] * size,
                "intercept": 42.0,
                "scaler_mean": [0.0] * size,
                "scaler_scale": [1.0] * size,
            },
            "feature_version": "daily-observed-v3",
        },
    }]
    if include_classifier:
        active.append({
            "province_id": "TH-30",
            "task_type": "classification",
            "model_name": "lightgbm-classifier",
            "run_id": "22222222-2222-4222-8222-222222222222",
            "model_params": {
                "serving_policy": "classifier_with_regression_fallback",
                "portable_classifier": {
                    "threshold_version": ml.THRESHOLD_VERSION,
                    "feature_cols": ml.FEATURE_COLS,
                    "classes": [1, 2, 3, 4, 5],
                    "coefficients": [[0.0] * size for _ in range(5)],
                    "intercepts": [0.0, 0.0, 0.0, 5.0, 0.0],
                    "scaler_mean": [0.0] * size,
                    "scaler_scale": [1.0] * size,
                },
            },
        })
    today = ml.datetime.now(ml.BANGKOK).date().isoformat()
    feature_row = {
        "province_id": "TH-30",
        "date": today,
        "pm25_mean": 35.0,
        "pm25_lag_1d": 30.0,
        "pm25_lag_3d": 25.0,
        "pm25_lag_7d": 20.0,
        "pm25_roll7": 27.0,
        "neighbor_pm25_avg": 30.0,
        "regional_pm25_avg": 29.0,
        "temp_mean": 30.0,
        "humidity_mean": 65.0,
        "wind_speed_mean": 2.0,
        "precip_total": 0.0,
        "hotspot_count": 2,
        "total_frp": 4.0,
        "month": 7,
        "day_of_week": 3,
        "is_burning_season": 0,
        "is_dry_season": 0,
        "trusted_hours": 24,
    }

    class Query:
        def __init__(self, rows): self.rows = rows
        def select(self, *_args): return self
        def eq(self, *_args): return self
        def in_(self, *_args): return self
        def gte(self, *_args): return self
        def order(self, *_args): return self
        def limit(self, *_args): return self
        def execute(self): return type("Resp", (), {"data": self.rows})()

    class SB:
        def table(self, name):
            return Query(active if name == "model_registry" else [feature_row])

    return SB()


def test_dual_forecast_contains_direct_classification_and_consistency():
    row = ml.make_forecasts(_forecast_sb(), horizon=1)[0]
    assert row["pm25_mean_forecast"] == 42.0
    assert row["regression_derived_class"] == 4
    assert row["classifier_predicted_class"] == 4
    assert row["displayed_class"] == 4
    assert row["class_agreement"] is True
    assert row["classification_source"] == "active_classifier"
    assert row["fallback_used"] is False
    assert sum(row["class_probabilities"].values()) == pytest.approx(1.0)


def test_missing_classifier_uses_explicit_regression_fallback():
    row = ml.make_forecasts(_forecast_sb(include_classifier=False), horizon=1)[0]
    assert row["displayed_class"] == row["regression_derived_class"]
    assert row["classifier_predicted_class"] is None
    assert row["classification_source"] == "regression_threshold"
    assert row["fallback_used"] is True
    assert row["fallback_reason"] == "no_eligible_active_classifier"
