import hashlib
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd
import pytest
from sklearn.ensemble import RandomForestClassifier

from api.ml.portable_trees import (
    _rf_leaf_probabilities,
    decode_artifact,
    encode_artifact,
    evaluate_lightgbm_regressor,
    evaluate_random_forest_classifier,
    export_lightgbm_regressor,
    export_random_forest_classifier,
)
from training.dual_model_config import (
    FEATURE_COLUMNS,
    POOLED_EMBARGO_DAYS,
    POOLED_FEATURE_COLUMNS,
    POOLED_MINIMUM_ORIGIN_DAYS,
    POOLED_TEST_DAYS,
    POOLED_VALIDATION_DAYS,
    PipelineConfig,
)
from training.pm25_classes import THRESHOLD_VERSION
from training.train_pooled_models import (
    DIRECT_HORIZONS,
    PooledSplit,
    PooledResult,
    RegressionProvinceResult,
    _record_global_eligibility_context,
    build_pooled_examples,
    pooled_chronological_split,
    pooled_walk_forward_folds,
    train_regression,
    upload_and_register,
)


def observed_frame(days=230):
    frames = []
    for province_index, province_id in enumerate(("TH-30", "TH-31")):
        dates = pd.date_range("2025-01-01", periods=days, freq="D")
        data = {
            "province_id": [province_id] * days,
            "date": dates,
            "trusted_hours": [24] * days,
            "trusted_sources": [["open-meteo"]] * days,
        }
        for index, column in enumerate(FEATURE_COLUMNS):
            if column == "pm25_mean":
                data[column] = 20 + province_index + np.sin(np.arange(days) / 12) * 8
            elif column in {"is_burning_season", "is_dry_season"}:
                data[column] = np.zeros(days)
            else:
                data[column] = np.linspace(index, index + 1, days)
        frames.append(pd.DataFrame(data))
    return pd.concat(frames, ignore_index=True)


def test_pooled_targets_keep_provinces_and_horizons_separate():
    metadata = pd.DataFrame([
        {"province_id": "TH-30", "lat": 14.9, "lon": 102.1},
        {"province_id": "TH-31", "lat": 15.0, "lon": 103.1},
    ])
    examples = build_pooled_examples(observed_frame(), metadata)
    first = examples[
        (examples["province_id"] == "TH-30")
        & (examples["forecast_horizon_days"] == 7)
    ].iloc[0]
    assert first["target_date"] == first["date"] + pd.Timedelta(days=7)
    assert first["target_pm25"] == pytest.approx(
        observed_frame().query("province_id == 'TH-30'").iloc[7]["pm25_mean"]
    )
    assert len(POOLED_FEATURE_COLUMNS) == len(set(POOLED_FEATURE_COLUMNS))


def test_pooled_split_groups_dates_and_purges_horizon_overlap():
    metadata = pd.DataFrame([
        {"province_id": "TH-30", "lat": 14.9, "lon": 102.1},
        {"province_id": "TH-31", "lat": 15.0, "lon": 103.1},
    ])
    split = pooled_chronological_split(
        build_pooled_examples(observed_frame(days=850), metadata),
        PipelineConfig(minimum_rows=POOLED_MINIMUM_ORIGIN_DAYS),
    )
    assert set(split.train["date"]).isdisjoint(split.validation["date"])
    assert set(split.validation["date"]).isdisjoint(split.test["date"])
    assert split.train["target_date"].max() < split.validation["date"].min()
    assert split.validation["target_date"].max() < split.test["date"].min()
    assert split.validation["date"].nunique() == POOLED_VALIDATION_DAYS
    assert split.test["date"].nunique() == POOLED_TEST_DAYS
    assert len(split.dropped_embargo_dates) == 2 * POOLED_EMBARGO_DAYS

    folds = pooled_walk_forward_folds(split.train, 3)
    assert len(folds) == 3
    for fold_train, fold_validation in folds:
        assert set(fold_train["date"]).isdisjoint(fold_validation["date"])
        assert fold_train["target_date"].max() < fold_validation["date"].min()


def test_pooled_split_rejects_less_than_full_production_history():
    metadata = pd.DataFrame([
        {"province_id": "TH-30", "lat": 14.9, "lon": 102.1},
        {"province_id": "TH-31", "lat": 15.0, "lon": 103.1},
    ])
    examples = build_pooled_examples(observed_frame(days=500), metadata)

    with pytest.raises(ValueError, match="validation=365, test=365, embargo=7x2"):
        pooled_chronological_split(examples, PipelineConfig())


def test_v5_6_2_default_critical_recall_is_035():
    assert PipelineConfig().classifier_minimum_critical_recall == pytest.approx(0.35)


def test_global_regression_gate_does_not_overwrite_local_eligibility():
    province_metrics = {
        "TH-30": {"eligible": True, "eligibility_reasons": ["eligible"]},
        "TH-31": {
            "eligible": False,
            "eligibility_reasons": ["skill_below_threshold"],
        },
    }

    _record_global_eligibility_context(province_metrics, global_eligible=False)

    assert province_metrics["TH-30"]["eligible"] is True
    assert province_metrics["TH-30"]["local_eligible"] is True
    assert province_metrics["TH-31"]["eligible"] is False
    assert province_metrics["TH-31"]["local_eligible"] is False
    assert all(
        metrics["global_gate_eligible"] is False
        for metrics in province_metrics.values()
    )


def test_regression_resume_skips_every_completed_province(monkeypatch):
    province_ids = ("TH-30", "TH-31")

    def frame(target_offset):
        rows = []
        for province_index, province_id in enumerate(province_ids):
            for horizon in DIRECT_HORIZONS:
                rows.append({
                    "province_id": province_id,
                    "forecast_horizon_days": horizon,
                    "target_pm25": 20.0 + province_index + horizon + target_offset,
                    "pm25_mean": 19.0 + province_index + horizon + target_offset,
                    "date": pd.Timestamp("2025-01-01") + pd.Timedelta(days=horizon),
                })
        return pd.DataFrame(rows)

    split = PooledSplit(
        train=frame(-2.0),
        validation=frame(-1.0),
        test=frame(0.0),
        dropped_embargo_dates=[],
    )
    completed = {}
    for province_id in province_ids:
        validation_rows = split.validation.query("province_id == @province_id")
        test_rows = split.test.query("province_id == @province_id")
        completed[province_id] = RegressionProvinceResult(
            province_id=province_id,
            model=object(),
            runtime_artifact={"province_id": province_id},
            parameters={"num_leaves": 31},
            validation_predictions=validation_rows["target_pm25"].to_numpy(),
            test_predictions=test_rows["target_pm25"].to_numpy(),
            province_metrics={
                "eligible": True,
                "eligibility_reasons": ["eligible"],
                "mae": 0.0,
                "rmse": 0.0,
                "r2": 1.0,
                "skill_vs_persistence": 1.0,
            },
        )

    def fail_if_trained(*_args, **_kwargs):
        raise AssertionError("completed province was retrained")

    monkeypatch.setattr(
        "training.train_pooled_models._train_regression_batch",
        fail_if_trained,
    )
    callbacks = []
    result = train_regression(
        split,
        PipelineConfig(minimum_validation_rows=1, minimum_test_rows=1),
        province_results=completed,
        on_province_complete=callbacks.append,
    )

    assert callbacks == []
    assert set(result.model) == set(province_ids)
    assert set(result.province_metrics) == set(province_ids)
    assert result.test_predictions is not None
    assert np.all(np.isfinite(result.test_predictions))


def test_lightgbm_portable_tree_matches_native_predictions():
    rng = np.random.default_rng(42)
    X = rng.normal(size=(250, 5))
    y = 2 * X[:, 0] - X[:, 1] ** 2 + rng.normal(scale=0.1, size=len(X))
    model = lgb.LGBMRegressor(
        n_estimators=40,
        max_depth=4,
        random_state=42,
        verbose=-1,
    ).fit(X, y)
    artifact = decode_artifact(encode_artifact(export_lightgbm_regressor(
        model,
        [f"f{index}" for index in range(X.shape[1])],
        feature_version="test-v1",
    )))
    portable = np.asarray([
        evaluate_lightgbm_regressor(row, artifact)
        for row in X[:50]
    ])
    assert portable == pytest.approx(model.predict(X[:50]), abs=1e-10, rel=1e-10)


def test_residual_lightgbm_portable_tree_applies_persistence_transform():
    rng = np.random.default_rng(123)
    X = rng.normal(size=(250, 5))
    X[:, 0] = rng.uniform(5.0, 80.0, size=len(X))
    residual = 0.4 * X[:, 1] - 0.2 * X[:, 2]
    model = lgb.LGBMRegressor(
        n_estimators=40,
        max_depth=4,
        random_state=42,
        verbose=-1,
    ).fit(X, residual)
    correction_weight = 0.45
    artifact = decode_artifact(encode_artifact(export_lightgbm_regressor(
        model,
        ["pm25_mean", "f1", "f2", "f3", "f4"],
        feature_version="test-v2",
        prediction_transform={
            "kind": "persistence_residual_blend",
            "persistence_feature": "pm25_mean",
            "correction_weight": correction_weight,
        },
    )))
    expected = X[:50, 0] + correction_weight * model.predict(X[:50])
    portable = np.asarray([
        evaluate_lightgbm_regressor(row, artifact)
        for row in X[:50]
    ])
    assert portable == pytest.approx(expected, abs=1e-10, rel=1e-10)


def test_random_forest_portable_tree_matches_native_probabilities():
    rng = np.random.default_rng(7)
    X = rng.normal(size=(250, 4))
    y = np.digitize(X[:, 0] - X[:, 1], [-1.0, 0.0, 1.0]) + 1
    model = RandomForestClassifier(
        n_estimators=35,
        max_depth=6,
        random_state=42,
    ).fit(X, y)
    artifact = decode_artifact(encode_artifact(export_random_forest_classifier(
        model,
        [f"f{index}" for index in range(X.shape[1])],
        feature_version="test-v1",
        threshold_version=THRESHOLD_VERSION,
    )))
    portable = np.asarray([
        [
            evaluate_random_forest_classifier(row, artifact)[str(class_id)]
            for class_id in model.classes_
        ]
        for row in X[:50]
    ])
    assert portable == pytest.approx(model.predict_proba(X[:50]), abs=1e-12, rel=1e-12)


def test_random_forest_temperature_scaling_aligns_missing_public_class():
    rng = np.random.default_rng(11)
    X = rng.normal(size=(300, 4))
    y = np.digitize(X[:, 0] - X[:, 1], [-1.0, 0.0, 1.0]) + 1
    model = RandomForestClassifier(
        n_estimators=35,
        max_depth=6,
        random_state=42,
    ).fit(X, y)
    artifact = export_random_forest_classifier(
        model,
        [f"f{index}" for index in range(X.shape[1])],
        feature_version="test-v1",
        threshold_version=THRESHOLD_VERSION,
        temperature=1.5,
    )

    native = np.zeros((50, 5), dtype=float)
    native[:, np.asarray(model.classes_, dtype=int) - 1] = model.predict_proba(X[:50])
    logits = np.log(np.clip(native, 1e-12, 1.0)) / 1.5
    logits -= logits.max(axis=1, keepdims=True)
    native = np.exp(logits)
    native /= native.sum(axis=1, keepdims=True)

    portable = np.asarray([
        list(evaluate_random_forest_classifier(row, artifact).values())
        for row in X[:50]
    ])
    assert portable == pytest.approx(native, abs=1e-12, rel=1e-12)


def test_random_forest_portable_traversal_matches_sklearn_float32_boundary():
    upper = np.float32(1.0)
    lower = np.nextafter(upper, np.float32(-np.inf))
    threshold = float(lower) + 0.75 * (float(upper) - float(lower))
    value = np.nextafter(threshold, -np.inf)
    assert value <= threshold
    assert float(np.float32(value)) > threshold

    tree = {
        "children_left": [1, -1, -1],
        "children_right": [2, -1, -1],
        "features": [0, -2, -2],
        "thresholds": [threshold, -2.0, -2.0],
        "values": [[1.0, 1.0], [1.0, 0.0], [0.0, 1.0]],
    }
    probabilities = _rf_leaf_probabilities(tree, np.asarray([value], dtype=float))
    assert probabilities == pytest.approx([0.0, 1.0])


def test_runtime_artifacts_are_not_checked_into_git():
    assert "training/artifacts" in Path(".gitignore").read_text()


def test_upload_uses_local_regressors_one_classifier_and_atomic_activation(tmp_path):
    artifacts = {"regression": {}, "classification": {}}
    province_ids = ("TH-30", "TH-31")
    for province_id in province_ids:
        target = tmp_path / province_id
        target.mkdir()
        native = target / "model.joblib"
        runtime = target / "runtime.json.gz"
        native.write_bytes(f"native-{province_id}".encode())
        runtime.write_bytes(f"runtime-{province_id}".encode())
        artifacts["regression"][province_id] = {
            "native_path": native,
            "runtime_path": runtime,
            "native_sha256": hashlib.sha256(native.read_bytes()).hexdigest(),
            "runtime_sha256": hashlib.sha256(runtime.read_bytes()).hexdigest(),
        }
    classifier_dir = tmp_path / "pooled"
    classifier_dir.mkdir()
    classifier_native = classifier_dir / "model.joblib"
    classifier_runtime = classifier_dir / "runtime.json.gz"
    classifier_native.write_bytes(b"native-classifier")
    classifier_runtime.write_bytes(b"runtime-classifier")
    artifacts["classification"]["pooled"] = {
        "native_path": classifier_native,
        "runtime_path": classifier_runtime,
        "native_sha256": hashlib.sha256(classifier_native.read_bytes()).hexdigest(),
        "runtime_sha256": hashlib.sha256(classifier_runtime.read_bytes()).hexdigest(),
    }
    registry_rows = [
        {"province_id": province_id, "task_type": task_type}
        for province_id in province_ids
        for task_type in ("regression", "classification")
    ]
    result = PooledResult(
        "00000000-0000-0000-0000-000000000001",
        province_ids,
        None,
        None,
        None,
        registry_rows,
        {},
    )

    class Response:
        def execute(self):
            return self

    class Bucket:
        def __init__(self, uploads, objects, downloads):
            self.uploads = uploads
            self.objects = objects
            self.downloads = downloads

        def upload(self, remote, handle, options):
            payload = handle.read()
            self.uploads.append((remote, payload, options))
            self.objects[remote] = payload
            return Response()

        def download(self, remote):
            self.downloads.append(remote)
            return self.objects[remote]

    class Storage:
        def __init__(self, uploads, objects, downloads):
            self.uploads = uploads
            self.objects = objects
            self.downloads = downloads

        def from_(self, name):
            assert name == "model-artifacts"
            return Bucket(self.uploads, self.objects, self.downloads)

    class Client:
        def __init__(self):
            self.uploads = []
            self.objects = {}
            self.downloads = []
            self.rpc_calls = []
            self.storage = Storage(self.uploads, self.objects, self.downloads)

        def rpc(self, name, arguments):
            self.rpc_calls.append((name, arguments))
            return Response()

    client = Client()
    upload_and_register(client, result, artifacts, activate=True)

    assert len(client.uploads) == 6
    assert len(client.downloads) == 6
    assert all(upload[2]["upsert"] == "false" for upload in client.uploads)
    assert client.rpc_calls[0] == ("fn_upsert_model_registry", {"rows": registry_rows})
    assert client.rpc_calls[1] == (
        "fn_activate_pooled_dual_model_run",
        {
            "p_run_id": result.run_id,
            "p_required_provinces": len(province_ids),
        },
    )
    assert len(client.rpc_calls) == 2
    assert all(row["runtime_artifact_uri"].startswith("storage://model-artifacts/") for row in registry_rows)
    assert len({row["runtime_artifact_uri"] for row in registry_rows if row["task_type"] == "regression"}) == 2
    assert len({row["runtime_artifact_uri"] for row in registry_rows if row["task_type"] == "classification"}) == 1


def test_upload_rerun_reuses_only_checksum_identical_storage_objects(tmp_path):
    native = tmp_path / "model.joblib"
    runtime = tmp_path / "runtime.json.gz"
    native.write_bytes(b"reviewed-native")
    runtime.write_bytes(b"reviewed-runtime")
    artifacts = {
        "regression": {
            "TH-30": {
                "native_path": native,
                "runtime_path": runtime,
                "native_sha256": hashlib.sha256(native.read_bytes()).hexdigest(),
                "runtime_sha256": hashlib.sha256(runtime.read_bytes()).hexdigest(),
            }
        },
        "classification": {},
    }
    registry_rows = [{"province_id": "TH-30", "task_type": "regression"}]
    result = PooledResult(
        "00000000-0000-0000-0000-000000000001",
        ("TH-30",),
        None,
        None,
        None,
        registry_rows,
        {},
    )

    class DuplicateStorageError(Exception):
        statusCode = 409
        code = "Duplicate"

    class Response:
        def execute(self):
            return self

    class Bucket:
        def __init__(self):
            self.objects = {
                f"{result.run_id}/TH-30/regression/model.joblib": native.read_bytes(),
                f"{result.run_id}/TH-30/regression/runtime.json.gz": runtime.read_bytes(),
            }

        def upload(self, remote, handle, options):
            raise DuplicateStorageError("The resource already exists")

        def download(self, remote):
            return self.objects[remote]

    class Storage:
        def __init__(self, bucket):
            self.bucket = bucket

        def from_(self, name):
            assert name == "model-artifacts"
            return self.bucket

    class Client:
        def __init__(self):
            self.bucket = Bucket()
            self.storage = Storage(self.bucket)
            self.rpc_calls = []

        def rpc(self, name, arguments):
            self.rpc_calls.append((name, arguments))
            return Response()

    client = Client()
    upload_and_register(client, result, artifacts, activate=False)

    assert client.rpc_calls == [("fn_upsert_model_registry", {"rows": registry_rows})]


def test_upload_rerun_rejects_checksum_mismatch_before_registry(tmp_path):
    native = tmp_path / "model.joblib"
    runtime = tmp_path / "runtime.json.gz"
    native.write_bytes(b"reviewed-native")
    runtime.write_bytes(b"reviewed-runtime")
    artifacts = {
        "regression": {
            "TH-30": {
                "native_path": native,
                "runtime_path": runtime,
                "native_sha256": hashlib.sha256(native.read_bytes()).hexdigest(),
                "runtime_sha256": hashlib.sha256(runtime.read_bytes()).hexdigest(),
            }
        },
        "classification": {},
    }
    registry_rows = [{"province_id": "TH-30", "task_type": "regression"}]
    result = PooledResult(
        "00000000-0000-0000-0000-000000000001",
        ("TH-30",),
        None,
        None,
        None,
        registry_rows,
        {},
    )

    class DuplicateStorageError(Exception):
        statusCode = 409
        code = "Duplicate"

    class Bucket:
        def upload(self, remote, handle, options):
            raise DuplicateStorageError("The resource already exists")

        def download(self, remote):
            return b"different-bytes"

    class Storage:
        def from_(self, name):
            assert name == "model-artifacts"
            return Bucket()

    class Client:
        def __init__(self):
            self.storage = Storage()
            self.rpc_calls = []

        def rpc(self, name, arguments):
            self.rpc_calls.append((name, arguments))
            raise AssertionError("Registry RPC must not run after checksum mismatch")

    client = Client()
    with pytest.raises(RuntimeError, match="mismatched bytes"):
        upload_and_register(client, result, artifacts, activate=True)
    assert client.rpc_calls == []
