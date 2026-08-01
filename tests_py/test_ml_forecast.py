import importlib.util
from datetime import date
from pathlib import Path

import numpy as np
import pytest

from api.ml.portable_trees import encode_artifact

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


def test_legacy_surrogate_does_not_require_a_persistence_feature():
    artifact = surrogate_artifact()
    artifact["feature_cols"] = ["legacy"] + artifact["feature_cols"][1:]
    assert ml.evaluate_surrogate(
        np.asarray([15.0] + [0.0] * (len(ml.FEATURE_COLS) - 1)),
        artifact,
    ) == 14.0


def test_ensemble6_uses_registered_runtime_surrogate():
    features = np.asarray([15.0] + [0.0] * (len(ml.FEATURE_COLS) - 1))
    prediction = ml._predict_model(
        ml.ENSEMBLE6_MODEL,
        {"surrogate": surrogate_artifact()},
        features,
        [10.0, 15.0],
    )
    assert prediction == 14.0


def test_unknown_model_falls_back_to_recent_mean():
    rolling = [10.0, 20.0, 40.0]
    features = np.zeros(len(ml.FEATURE_COLS))
    expected = np.mean(rolling)
    assert ml.recent_mean_forecast(rolling) == expected
    assert ml._predict_model("unknown", {}, features, rolling) == expected


def test_recent_mean_fallback_uses_only_the_configured_window():
    rolling = [500.0, 10.0, 20.0, 30.0]
    assert ml.recent_mean_forecast(rolling, window_days=3) == 20.0
    with pytest.raises(ValueError, match="window"):
        ml.recent_mean_forecast(rolling, window_days=0)


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


def test_portable_classifier_can_blend_with_current_day_class():
    size = len(ml.FEATURE_COLS)
    artifact = {
        "threshold_version": ml.THRESHOLD_VERSION,
        "feature_cols": ml.FEATURE_COLS,
        "classes": [1, 2],
        "coefficients": [[0.0] * size],
        "intercepts": [10.0],
        "scaler_mean": [0.0] * size,
        "scaler_scale": [1.0] * size,
        "model_weight": 0.25,
        "persistence_feature": "pm25_mean",
    }
    features = np.zeros(size)
    features[ml.FEATURE_COLS.index("pm25_mean")] = 60.0
    probabilities = ml.evaluate_portable_classifier(features, artifact)
    assert probabilities["4"] == pytest.approx(0.75)
    assert probabilities["2"] == pytest.approx(0.25, abs=1e-4)


def test_random_forest_temperature_scaling_aligns_missing_classes_first():
    compact = np.asarray([0.1, 0.2, 0.3, 0.4, 0.0], dtype=float)
    logits = np.log(np.clip(compact, 1e-12, 1.0)) / 1.5
    logits -= np.max(logits)
    expected = np.exp(logits)
    expected /= expected.sum()
    artifact = {
        "artifact_schema": ml.TREE_ARTIFACT_SCHEMA,
        "task_type": "classification",
        "model_family": "random_forest",
        "feature_version": "test",
        "feature_cols": ["x"],
        "threshold_version": ml.THRESHOLD_VERSION,
        "classes": [1, 2, 3, 4],
        "temperature": 1.5,
        "trees": [{
            "children_left": [-1],
            "children_right": [-1],
            "features": [-2],
            "thresholds": [-2.0],
            "values": [[1.0, 2.0, 3.0, 4.0]],
        }],
    }
    actual = ml.evaluate_random_forest_classifier(
        np.asarray([0.0]),
        artifact,
        class_ids=ml.CLASS_IDS,
    )
    assert [actual[str(class_id)] for class_id in ml.CLASS_IDS] == pytest.approx(
        expected,
        abs=1e-12,
        rel=1e-12,
    )


def test_portable_classifier_rejects_threshold_version_mismatch():
    with pytest.raises(ValueError, match="schema"):
        ml.evaluate_portable_classifier(
            np.zeros(len(ml.FEATURE_COLS)),
            {"threshold_version": "wrong"},
        )


def test_private_tree_artifact_is_checksum_verified_and_cached():
    artifact = {
        "artifact_schema": ml.TREE_ARTIFACT_SCHEMA,
        "task_type": "regression",
        "model_family": "lightgbm",
        "feature_version": "daily-pooled-v1",
        "feature_cols": ["pm25_mean", "forecast_horizon_days"],
        "trees": [{"leaf_value": 42.0}],
    }
    payload = encode_artifact(artifact)
    digest = ml.hashlib.sha256(payload).hexdigest()
    downloads = []

    class Bucket:
        def download(self, path):
            downloads.append(path)
            return payload

    class Storage:
        def from_(self, bucket):
            assert bucket == "model-artifacts"
            return Bucket()

    class SB:
        storage = Storage()

    row = {
        "feature_version": "daily-pooled-v1",
        "runtime_artifact_uri": "storage://model-artifacts/run/pooled/regression/runtime.json.gz",
        "runtime_artifact_sha256": digest,
    }
    cache = {}
    loaded = ml.load_runtime_artifact(SB(), row, cache)
    assert loaded == artifact
    assert ml.load_runtime_artifact(SB(), row, cache) is loaded
    assert downloads == ["run/pooled/regression/runtime.json.gz"]


def test_pooled_feature_vector_contains_identity_coordinates_and_horizon():
    vector = ml.build_feature_vector(
        {"pm25_mean": 30},
        [20.0, 25.0, 30.0],
        date(2026, 8, 1),
        [
            "province_latitude",
            "province_longitude",
            "forecast_horizon_days",
            "province_TH_30",
            "province_TH_31",
        ],
        province_id="TH-30",
        province_metadata={"TH-30": {"lat": 14.9, "lon": 102.1}},
        forecast_horizon_days=7,
    )
    assert vector.tolist() == pytest.approx([14.9, 102.1, 7.0, 1.0, 0.0])


def _forecast_sb(include_classifier=True, include_regression=True):
    size = len(ml.FEATURE_COLS)
    active = []
    if include_regression:
        active.append({
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
        })
    if include_classifier:
        active.append({
            "province_id": "TH-30",
            "task_type": "classification",
            "model_name": "lightgbm-classifier",
            "run_id": "22222222-2222-4222-8222-222222222222",
            "eligibility_status": True,
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
        "pm25_roll3": 32.0,
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


def test_missing_eligible_regressor_uses_recent_mean_forecast():
    row = ml.make_forecasts(
        _forecast_sb(include_classifier=False, include_regression=False),
        horizon=1,
    )[0]
    assert row["pm25_mean_forecast"] == 35.0
    assert row["model_name"] == ml.FALLBACK_MODEL_NAME
    assert row["regression_model_name"] == ml.FALLBACK_MODEL_NAME
    assert row["regression_run_id"] is None
    assert row["fallback_used"] is True
    assert row["fallback_reason"] == "mean_regression_fallback"


def test_missing_classifier_uses_explicit_regression_fallback():
    row = ml.make_forecasts(_forecast_sb(include_classifier=False), horizon=1)[0]
    assert row["displayed_class"] == row["regression_derived_class"]
    assert row["classifier_predicted_class"] is None
    assert row["classification_source"] == "regression_threshold"
    assert row["fallback_used"] is True
    assert row["fallback_reason"] == "no_eligible_active_classifier"


def test_only_d1_uses_classifier_and_later_horizons_are_experimental():
    rows = ml.make_forecasts(_forecast_sb(), horizon=2)
    assert rows[0]["classification_source"] == "active_classifier"
    assert rows[0]["horizon_reliability"] == "evaluated_d1"
    assert rows[0]["is_experimental"] is False
    assert rows[1]["classifier_predicted_class"] is None
    assert rows[1]["classification_source"] == "regression_threshold"
    assert rows[1]["horizon_reliability"] == "experimental_recursive"
    assert rows[1]["is_experimental"] is True
    assert (
        rows[1]["fallback_reason"]
        == "experimental_horizon_regression_threshold"
    )


def test_forecast_run_lifecycle_links_rows_and_closes_success(monkeypatch):
    calls = []

    class Query:
        def __init__(self, table):
            self.table = table

        def insert(self, payload):
            calls.append(("insert", self.table, payload))
            return self

        def update(self, payload):
            calls.append(("update", self.table, payload))
            return self

        def eq(self, column, value):
            calls.append(("eq", self.table, column, value))
            return self

        def execute(self):
            return type("Resp", (), {"data": {}})()

    class RPC:
        def __init__(self, name):
            self.name = name

        def execute(self):
            data = {"evaluated": 7} if self.name == "fn_evaluate_due_forecasts" else {"upserted": 3}
            return type("Resp", (), {"data": data})()

    class SB:
        def table(self, name):
            return Query(name)

        def rpc(self, name, *_args, **_kwargs):
            assert name in {
                "fn_evaluate_due_forecasts",
                "fn_refresh_model_drift_metrics",
            }
            return RPC(name)

    rows = [{
        "province_id": "TH-30",
        "forecast_at": "2026-07-26T00:00:00+00:00",
        "data_freshness": "2026-07-25T23:59:59+07:00",
    }]
    monkeypatch.setattr(ml, "make_forecasts", lambda _sb, _horizon: rows)
    monkeypatch.setattr(ml, "upsert_forecasts", lambda _sb, _rows: 1)
    monkeypatch.setattr(ml, "upsert_feature_snapshots", lambda _sb: 1)

    output, count, evaluated = ml.execute_forecast_run(SB(), 1)

    assert output == rows
    assert count == 1
    assert evaluated == 7
    assert len(rows[0]["forecast_run_id"]) == 36
    assert any(
        call[0:2] == ("update", "forecast_runs")
        and call[2]["status"] == "partial"
        for call in calls
    )


def test_forecast_run_lifecycle_records_error(monkeypatch):
    calls = []

    class Query:
        def __init__(self, table):
            self.table = table

        def insert(self, payload):
            calls.append(("insert", self.table, payload))
            return self

        def update(self, payload):
            calls.append(("update", self.table, payload))
            return self

        def eq(self, *_args):
            return self

        def execute(self):
            return type("Resp", (), {"data": {}})()

    class RPC:
        def execute(self):
            return type("Resp", (), {"data": {"evaluated": 0}})()

    class SB:
        def table(self, name):
            return Query(name)

        def rpc(self, *_args, **_kwargs):
            return RPC()

    def fail_forecast(_sb, _horizon):
        raise RuntimeError("test failure")

    monkeypatch.setattr(ml, "make_forecasts", fail_forecast)
    monkeypatch.setattr(ml, "upsert_feature_snapshots", lambda _sb: 0)
    with pytest.raises(RuntimeError, match="test failure"):
        ml.execute_forecast_run(SB(), 1)
    assert any(
        call[0:2] == ("update", "forecast_runs")
        and call[2]["status"] == "error"
        for call in calls
    )


def test_calibrated_prediction_interval_uses_registered_residual_quantiles():
    p10, p50, p90, method = ml.prediction_interval(
        40.0,
        1,
        {
            "surrogate": {
                "residual_quantiles": {
                    "p10": -5.0,
                    "p50": 1.0,
                    "p90": 8.0,
                },
            },
        },
        [30.0, 35.0, 40.0],
    )
    assert (p10, p50, p90) == (35.0, 41.0, 48.0)
    assert method == "calibrated_chronological_residual"


def test_interval_uses_recent_variability_as_a_minimum_width():
    p10, _p50, p90, method = ml.prediction_interval(
        40.0,
        1,
        {
            "surrogate": {
                "residual_quantiles": {
                    "p10": -1.0,
                    "p50": 0.0,
                    "p90": 1.0,
                },
            },
        },
        [10.0, 20.0, 30.0, 40.0],
    )
    assert p10 == 30.0
    assert p90 == 50.0
    assert method == "calibrated_residual_with_variability_floor"


def test_stale_source_is_rolled_forward_before_emitting_d1(monkeypatch):
    original = ml.load_recent_features
    today = ml.datetime.now(ml.BANGKOK).date()

    def stale_features(sb):
        rows = original(sb)["TH-30"]
        for index, row in enumerate(rows):
            row["date"] = (today - ml.timedelta(days=2 - index)).isoformat()
        return {"TH-30": rows}

    monkeypatch.setattr(ml, "load_recent_features", stale_features)
    rows = ml.make_forecasts(_forecast_sb(), horizon=2)
    assert [row["target_date"] for row in rows] == [
        (today + ml.timedelta(days=1)).isoformat(),
        (today + ml.timedelta(days=2)).isoformat(),
    ]
    assert [row["forecast_horizon_days"] for row in rows] == [1, 2]
