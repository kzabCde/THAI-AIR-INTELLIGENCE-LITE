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
    POOLED_FEATURE_COLUMNS,
    PipelineConfig,
)
from training.pm25_classes import THRESHOLD_VERSION
from training.train_pooled_models import (
    build_pooled_examples,
    pooled_chronological_split,
    pooled_walk_forward_folds,
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
        build_pooled_examples(observed_frame(), metadata),
        PipelineConfig(minimum_rows=180),
    )
    assert set(split.train["date"]).isdisjoint(split.validation["date"])
    assert set(split.validation["date"]).isdisjoint(split.test["date"])
    assert split.train["target_date"].max() < split.validation["date"].min()
    assert split.validation["target_date"].max() < split.test["date"].min()
    assert len(split.dropped_embargo_dates) == 14

    folds = pooled_walk_forward_folds(split.train, 3)
    assert len(folds) == 3
    for fold_train, fold_validation in folds:
        assert set(fold_train["date"]).isdisjoint(fold_validation["date"])
        assert fold_train["target_date"].max() < fold_validation["date"].min()


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
