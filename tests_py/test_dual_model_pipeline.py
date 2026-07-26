from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import pytest
from sklearn.linear_model import Ridge

from training.dual_model_config import FEATURE_COLUMNS, PipelineConfig
from training.train_dual_models import (
    _classification_eligibility,
    _powered_sample_weights,
    chronological_split,
    classification_metrics,
    expanding_window_indices,
    prepare_targets,
    regression_metrics,
    select_regression,
    train_province,
)


def training_frame(rows=220):
    dates = pd.date_range("2025-01-01", periods=rows, freq="D")
    data = {
        "province_id": ["TH-30"] * rows,
        "date": dates,
        "trusted_hours": [24] * rows,
        "trusted_sources": [["open-meteo"]] * rows,
    }
    for index, column in enumerate(FEATURE_COLUMNS):
        if column == "pm25_mean":
            data[column] = np.linspace(10, 100, rows)
        elif column in {"is_burning_season", "is_dry_season"}:
            data[column] = np.zeros(rows)
        else:
            data[column] = np.linspace(index, index + 1, rows)
    return pd.DataFrame(data)


def test_classification_target_comes_from_actual_future_pm25():
    frame = training_frame()
    prepared = prepare_targets(frame)
    assert prepared.iloc[0]["target_pm25_next_day"] == pytest.approx(
        frame.iloc[1]["pm25_mean"]
    )
    assert prepared.iloc[-1]["target_pm25_next_day"] == pytest.approx(
        frame.iloc[-1]["pm25_mean"]
    )
    assert "target_air_quality_class" not in FEATURE_COLUMNS


def test_chronological_split_never_moves_future_rows_into_training():
    prepared = prepare_targets(training_frame())
    split = chronological_split(prepared, PipelineConfig())
    assert split.train_rows["date"].max() < split.validation_rows["date"].min()
    assert split.validation_rows["date"].max() < split.test_rows["date"].min()
    assert len(split.y_reg_test) >= 30


def test_expanding_window_validation_is_ordered_and_covers_latest_development():
    folds = expanding_window_indices(180, 5)
    assert len(folds) == 5
    for train_index, validation_index in folds:
        assert len(train_index) >= 90
        assert train_index.max() < validation_index.min()
    assert folds[-1][1].max() == 179
    assert all(
        len(folds[index][0]) < len(folds[index + 1][0])
        for index in range(len(folds) - 1)
    )


def test_metric_functions_keep_regression_and_classification_separate():
    regression = regression_metrics(np.array([10, 20]), np.array([11, 19]))
    classification = classification_metrics(
        np.array([1, 2]),
        np.array([1, 1]),
        np.array([[0.8, 0.2, 0, 0, 0], [0.7, 0.3, 0, 0, 0]]),
    )
    assert {"mae", "rmse", "r2", "bias"} <= regression.keys()
    assert {"accuracy", "macro_precision", "macro_recall", "macro_f1"} <= classification.keys()
    assert "accuracy" not in regression
    assert "mae" not in classification


def test_absent_critical_classes_block_public_classifier_promotion():
    config = PipelineConfig(
        classifier_minimum_macro_f1=0.2,
        classifier_minimum_critical_recall=0.5,
    )
    per_class = {
        str(class_id): {
            "precision": 1.0,
            "recall": 1.0,
            "f1": 1.0,
            "support": 10 if class_id <= 3 else 0,
        }
        for class_id in range(1, 6)
    }
    metrics = {
        "test_rows": 30,
        "macro_f1": 0.8,
        "balanced_accuracy": 0.8,
        "weighted_f1": 0.8,
        "per_class": per_class,
    }
    baseline = {
        "macro_f1": 0.4,
        "balanced_accuracy": 0.4,
        "weighted_f1": 0.4,
    }
    train_metrics = {"macro_f1": 0.85}
    probabilities = np.full((30, 5), 0.2)
    eligible, reasons, warnings = _classification_eligibility(
        train_metrics, metrics, baseline, probabilities, config
    )
    assert not eligible
    assert "insufficient_evidence_class:4" in reasons
    assert "insufficient_evidence_class:5" in reasons
    assert "missing_critical_class_support:4" in warnings
    assert "missing_critical_class_support:5" in warnings


def test_macro_f1_always_uses_the_fixed_five_class_contract():
    metrics = classification_metrics(
        np.array([1, 1, 2, 2]),
        np.array([1, 1, 2, 2]),
        np.array([
            [1, 0, 0, 0, 0],
            [1, 0, 0, 0, 0],
            [0, 1, 0, 0, 0],
            [0, 1, 0, 0, 0],
        ]),
    )
    assert metrics["observed_macro_f1"] == pytest.approx(1.0)
    assert metrics["macro_f1"] == pytest.approx(0.4)
    assert metrics["balanced_accuracy"] == pytest.approx(0.4)
    assert metrics["metric_class_contract"] == [1, 2, 3, 4, 5]


def test_synthetic_hotspot_features_are_not_in_production_feature_contract():
    assert "hotspot_count" not in FEATURE_COLUMNS
    assert "total_frp" not in FEATURE_COLUMNS
    assert {"pm25_roll3", "day_of_year_sin", "day_of_year_cos"} <= set(
        FEATURE_COLUMNS
    )


def test_classifier_cannot_pass_by_sacrificing_weighted_f1():
    config = PipelineConfig(classifier_minimum_macro_f1=0.2)
    per_class = {
        str(class_id): {
            "precision": 0.5,
            "recall": 0.5,
            "f1": 0.5,
            "support": 10 if class_id <= 3 else 0,
        }
        for class_id in range(1, 6)
    }
    metrics = {
        "test_rows": 30,
        "macro_f1": 0.6,
        "balanced_accuracy": 0.6,
        "weighted_f1": 0.5,
        "per_class": per_class,
    }
    baseline = {
        "macro_f1": 0.4,
        "balanced_accuracy": 0.4,
        "weighted_f1": 0.55,
    }
    eligible, reasons, _ = _classification_eligibility(
        {"macro_f1": 0.6},
        metrics,
        baseline,
        np.full((30, 5), 0.2),
        config,
    )
    assert not eligible
    assert "weighted_f1_below_baseline" in reasons


def test_model_serialization_and_reload(tmp_path: Path):
    model = Ridge().fit(np.array([[0.0], [1.0], [2.0]]), np.array([1.0, 2.0, 3.0]))
    path = tmp_path / "model.joblib"
    expected = model.predict(np.array([[3.0]])).item()
    joblib.dump(model, path)
    restored = joblib.load(path)
    assert restored.predict(np.array([[3.0]])).item() == pytest.approx(expected)


def test_partial_class_balancing_is_less_extreme_than_full_balancing():
    labels = np.array([1] * 9 + [4])
    unweighted = _powered_sample_weights(labels, 0.0)
    partial = _powered_sample_weights(labels, 0.5)
    balanced = _powered_sample_weights(labels, 1.0)
    assert np.allclose(unweighted, 1.0)
    assert 1.0 < partial[-1] < balanced[-1]
    assert np.mean(partial) == pytest.approx(1.0)


def test_regression_selection_uses_production_surrogate_metrics():
    prepared = prepare_targets(training_frame(rows=240))
    split = chronological_split(prepared, PipelineConfig())
    config = PipelineConfig(
        allowed_model_families=("random_forest",),
        regression_surrogate_alphas=(1.0,),
        regression_blend_weights=(0.5,),
    )
    selection = select_regression(split, config)
    assert selection.test_metrics == selection.runtime_metrics
    assert selection.tuning == {"alpha": 1.0, "model_weight": 0.5}
    assert "production_surrogate" in selection.candidate_validation_metrics[
        "random_forest"
    ]


def test_end_to_end_training_records_expanding_cv_and_artifact_contract():
    config = PipelineConfig(
        cv_splits=2,
        allowed_model_families=("random_forest",),
        regression_surrogate_alphas=(1.0,),
        regression_blend_weights=(0.5,),
        classifier_regularization_c=(0.1,),
        classifier_weight_powers=(0.5,),
        classifier_blend_weights=(0.75,),
        classifier_temperatures=(1.0,),
    )
    result = train_province(
        "TH-30",
        training_frame(rows=240),
        "11111111-1111-4111-8111-111111111111",
        config,
    )
    cv = result.audit["expanding_window_validation"]
    assert cv["folds"] == 2
    assert cv["final_test_excluded"] is True
    assert len(cv["regression"]["fold_metrics"]) == 2
    assert (
        result.regression.runtime_artifact["calibration_method"]
        == "expanding_window_out_of_fold_residual"
    )
    for row in result.registry_rows:
        assert row["teacher_model_family"] == "random_forest"
        assert row["serving_model_family"] in {
            "standardized_ridge",
            "standardized_logistic",
        }
        assert len(row["model_params"]["portable_artifact_sha256"]) == 64
