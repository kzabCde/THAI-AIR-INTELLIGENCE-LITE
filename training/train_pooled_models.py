#!/usr/bin/env python3
"""Train residual LightGBM PM2.5 regressors and pooled RF classification.

All provinces for the same origin date stay in the same chronological split.
The targets are built directly from observed future PM2.5 for horizons D+1 to
D+7. Regression learns a province-specific correction to persistence and the
classifier remains pooled across all provinces. Candidates are registered
inactive; activation remains guarded by final-test evidence.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import os
import sys
import uuid
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from supabase import Client, create_client

from api.ml.portable_trees import (
    ARTIFACT_SCHEMA,
    encode_artifact,
    evaluate_lightgbm_regressor,
    evaluate_random_forest_classifier,
    export_lightgbm_regressor,
    export_random_forest_classifier,
)
from training.dual_model_config import (
    FALLBACK_MODEL_NAME,
    FALLBACK_STRATEGY,
    FALLBACK_WINDOW_DAYS,
    POOLED_CLASSIFICATION_FAMILY,
    POOLED_FEATURE_COLUMNS,
    POOLED_FEATURE_PROVENANCE,
    POOLED_FEATURE_VERSION,
    POOLED_EMBARGO_DAYS,
    POOLED_MINIMUM_ORIGIN_DAYS,
    POOLED_MINIMUM_TRAINING_DAYS,
    POOLED_PROVINCE_COLUMNS,
    POOLED_PROVINCE_IDS,
    POOLED_REGRESSION_FAMILY,
    POOLED_TEST_DAYS,
    POOLED_VALIDATION_DAYS,
    PipelineConfig,
)
from training.pm25_classes import CLASS_IDS, THRESHOLD_VERSION, class_mapping, classes_for_pm25
from training.train_dual_models import (
    ALLOWED_SOURCES_DEFAULT,
    MIN_TRUSTED_HOURS,
    OBSERVED_VIEW,
    _classification_eligibility,
    _git_sha,
    _json_safe,
    _regression_eligibility,
    classification_metrics,
    fetch_observed_rows,
    filter_training_rows,
    regression_metrics,
)

DIRECT_HORIZONS = tuple(range(1, 8))
MODEL_VERSION = "residual-dual-pm25-v2"
REGRESSION_MODEL_NAME = "lightgbm-pm25-residual-v2"
CLASSIFICATION_MODEL_NAME = "random-forest-aqi-classifier-pooled-v1"
CLASSIFICATION_FIXED_PARAMETERS = {
    "n_estimators": 400,
    "max_depth": 14,
    "min_samples_leaf": 2,
    "max_features": "sqrt",
}
CLASSIFICATION_TEMPERATURES = (0.75, 1.0, 1.25, 1.5)


@dataclass
class PooledSplit:
    train: pd.DataFrame
    validation: pd.DataFrame
    test: pd.DataFrame
    dropped_embargo_dates: list[str]


@dataclass
class TrainedTask:
    task_type: str
    family: str
    model: object
    validation_metrics: dict
    test_metrics: dict
    baseline_metrics: dict
    parameters: dict
    runtime_artifact: dict
    residual_quantiles_by_horizon: dict[str, dict[str, float]]
    global_eligible: bool
    global_reasons: list[str]
    province_metrics: dict[str, dict]
    validation_predictions: np.ndarray | None = None
    test_predictions: np.ndarray | None = None


@dataclass
class RegressionProvinceResult:
    """Serializable unit of work used to resume province-local regression."""

    province_id: str
    model: object
    runtime_artifact: dict
    parameters: dict
    validation_predictions: np.ndarray
    test_predictions: np.ndarray
    province_metrics: dict


@dataclass
class ClassificationFoldResult:
    """Serializable out-of-fold probabilities for one pooled CV fold."""

    fold_index: int
    truth: np.ndarray
    raw_probabilities: np.ndarray


@dataclass
class PooledResult:
    run_id: str
    province_ids: tuple[str, ...]
    split: PooledSplit
    regression: TrainedTask
    classification: TrainedTask
    registry_rows: list[dict]
    audit: dict


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--register", action="store_true")
    parser.add_argument("--activate", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--shadow", action="store_true", help="write artifacts and metrics without registry writes")
    parser.add_argument("--province", action="append", choices=POOLED_PROVINCE_IDS)
    parser.add_argument(
        "--min-rows",
        type=int,
        default=POOLED_MINIMUM_ORIGIN_DAYS,
        help="minimum unique origin dates (production policy: 834)",
    )
    parser.add_argument("--cv-splits", type=int, default=5)
    parser.add_argument("--artifact-dir", type=Path, default=Path("training/artifacts"))
    parser.add_argument("--allowed-source", action="append")
    args = parser.parse_args()
    if args.activate and (not args.register or args.dry_run or args.shadow):
        parser.error("--activate requires --register and cannot be dry-run/shadow")
    return args


def get_client() -> Client:
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
    return create_client(url, key)


def fetch_province_metadata(sb: Client, province_ids: tuple[str, ...]) -> pd.DataFrame:
    response = (
        sb.table("isan_provinces")
        .select("province_id,lat,lon")
        .in_("province_id", list(province_ids))
        .execute()
    )
    frame = pd.DataFrame(response.data or [])
    if set(frame.get("province_id", [])) != set(province_ids):
        missing = sorted(set(province_ids) - set(frame.get("province_id", [])))
        raise RuntimeError(f"missing province metadata: {missing}")
    frame["lat"] = pd.to_numeric(frame["lat"], errors="raise")
    frame["lon"] = pd.to_numeric(frame["lon"], errors="raise")
    return frame


def build_pooled_examples(
    observed: pd.DataFrame,
    province_metadata: pd.DataFrame,
    horizons: tuple[int, ...] = DIRECT_HORIZONS,
) -> pd.DataFrame:
    """Create direct-horizon examples without crossing province/date boundaries."""
    metadata = province_metadata.set_index("province_id")[["lat", "lon"]]
    rows: list[pd.DataFrame] = []
    for province_id, province in observed.groupby("province_id", sort=True):
        clean = (
            province.sort_values("date")
            .drop_duplicates("date", keep="last")
            .copy()
        )
        if province_id not in metadata.index:
            raise ValueError(f"metadata missing for {province_id}")
        for horizon in horizons:
            candidate = clean.copy()
            candidate["forecast_horizon_days"] = int(horizon)
            candidate["target_pm25"] = clean["pm25_mean"].shift(-horizon)
            candidate["target_date"] = clean["date"].shift(-horizon)
            expected = candidate["date"] + pd.to_timedelta(horizon, unit="D")
            candidate = candidate[candidate["target_date"] == expected].copy()
            candidate["target_air_quality_class"] = classes_for_pm25(
                candidate["target_pm25"].to_numpy(dtype=float)
            )
            candidate["province_latitude"] = float(metadata.loc[province_id, "lat"])
            candidate["province_longitude"] = float(metadata.loc[province_id, "lon"])
            for target_id, column in zip(
                POOLED_PROVINCE_IDS,
                POOLED_PROVINCE_COLUMNS,
                strict=True,
            ):
                candidate[column] = 1.0 if province_id == target_id else 0.0
            rows.append(candidate)
    if not rows:
        raise ValueError("no pooled examples were produced")
    pooled = pd.concat(rows, ignore_index=True)
    pooled = pooled.dropna(
        subset=[*POOLED_FEATURE_COLUMNS, "target_pm25", "target_air_quality_class"]
    )
    return pooled.sort_values(
        ["date", "province_id", "forecast_horizon_days"]
    ).reset_index(drop=True)


def pooled_chronological_split(
    examples: pd.DataFrame,
    config: PipelineConfig,
    *,
    embargo_days: int = POOLED_EMBARGO_DAYS,
) -> PooledSplit:
    dates = pd.Index(sorted(pd.to_datetime(examples["date"]).unique()))
    required_dates = (
        POOLED_MINIMUM_TRAINING_DAYS
        + POOLED_VALIDATION_DAYS
        + POOLED_TEST_DAYS
        + 2 * embargo_days
    )
    minimum_dates = max(config.minimum_rows, required_dates)
    if len(dates) < minimum_dates:
        raise ValueError(
            f"insufficient unique origin dates: {len(dates)} < {minimum_dates} "
            f"(train>={POOLED_MINIMUM_TRAINING_DAYS}, "
            f"validation={POOLED_VALIDATION_DAYS}, test={POOLED_TEST_DAYS}, "
            f"embargo={embargo_days}x2)"
        )
    test_start = len(dates) - POOLED_TEST_DAYS
    validation_end = test_start - embargo_days
    validation_start = validation_end - POOLED_VALIDATION_DAYS
    train_end = validation_start - embargo_days
    if train_end < POOLED_MINIMUM_TRAINING_DAYS:
        raise ValueError("purged chronological training split has fewer than 90 origin dates")
    train_dates = set(dates[:train_end])
    validation_dates = set(dates[validation_start:validation_end])
    test_dates = set(dates[test_start:])
    used = train_dates | validation_dates | test_dates
    dropped = [pd.Timestamp(value).date().isoformat() for value in dates if value not in used]
    split = PooledSplit(
        train=examples[examples["date"].isin(train_dates)].copy(),
        validation=examples[examples["date"].isin(validation_dates)].copy(),
        test=examples[examples["date"].isin(test_dates)].copy(),
        dropped_embargo_dates=dropped,
    )
    if split.train["target_date"].max() >= split.validation["date"].min():
        raise ValueError("training target overlaps validation feature period")
    if split.validation["target_date"].max() >= split.test["date"].min():
        raise ValueError("validation target overlaps final-test feature period")
    if split.validation["date"].nunique() != POOLED_VALIDATION_DAYS:
        raise RuntimeError("validation split does not contain exactly 365 origin dates")
    if split.test["date"].nunique() != POOLED_TEST_DAYS:
        raise RuntimeError("test split does not contain exactly 365 origin dates")
    return split


def pooled_walk_forward_folds(
    rows: pd.DataFrame,
    n_splits: int,
    *,
    embargo_days: int = max(DIRECT_HORIZONS),
) -> list[tuple[pd.DataFrame, pd.DataFrame]]:
    """Build expanding date-grouped CV folds with a target-overlap embargo."""
    dates = pd.Index(sorted(pd.to_datetime(rows["date"]).unique()))
    minimum_training_dates = 30
    validation_days = (len(dates) - minimum_training_dates - n_splits * embargo_days) // n_splits
    if validation_days < 7:
        raise ValueError("insufficient origin dates for purged walk-forward validation")
    initial_training_days = len(dates) - n_splits * (validation_days + embargo_days)
    folds: list[tuple[pd.DataFrame, pd.DataFrame]] = []
    for fold_index in range(n_splits):
        train_end = initial_training_days + fold_index * (validation_days + embargo_days)
        validation_start = train_end + embargo_days
        validation_end = validation_start + validation_days
        train_dates = set(dates[:train_end])
        validation_dates = set(dates[validation_start:validation_end])
        train_rows = rows[rows["date"].isin(train_dates)].copy()
        validation_rows = rows[rows["date"].isin(validation_dates)].copy()
        if train_rows["target_date"].max() >= validation_rows["date"].min():
            raise ValueError("walk-forward training target overlaps validation features")
        folds.append((train_rows, validation_rows))
    return folds


def _xy(rows: pd.DataFrame, target: str) -> tuple[np.ndarray, np.ndarray]:
    return (
        rows.loc[:, POOLED_FEATURE_COLUMNS].to_numpy(dtype=float),
        rows[target].to_numpy(),
    )


def _regression_baseline(rows: pd.DataFrame) -> tuple[np.ndarray, dict]:
    truth = rows["target_pm25"].to_numpy(dtype=float)
    prediction = rows["pm25_mean"].to_numpy(dtype=float)
    return prediction, regression_metrics(truth, prediction)


def _classification_baseline(rows: pd.DataFrame) -> tuple[np.ndarray, np.ndarray, dict]:
    truth = rows["target_air_quality_class"].to_numpy(dtype=int)
    prediction = classes_for_pm25(rows["pm25_mean"].to_numpy(dtype=float))
    probabilities = np.zeros((len(rows), len(CLASS_IDS)), dtype=float)
    probabilities[np.arange(len(rows)), prediction - 1] = 1.0
    return prediction, probabilities, classification_metrics(truth, prediction, probabilities)


def _d1(rows: pd.DataFrame) -> pd.DataFrame:
    return rows[rows["forecast_horizon_days"] == 1]


def _metrics_by_horizon(rows: pd.DataFrame, predictions: np.ndarray, *, task: str) -> dict:
    result: dict[str, dict] = {}
    for horizon in DIRECT_HORIZONS:
        mask = rows["forecast_horizon_days"].to_numpy(dtype=int) == horizon
        if not np.any(mask):
            continue
        if task == "regression":
            result[str(horizon)] = regression_metrics(
                rows.loc[mask, "target_pm25"].to_numpy(dtype=float),
                np.asarray(predictions)[mask],
            )
    return result


def _aligned_rf_probabilities(model: RandomForestClassifier, X: np.ndarray) -> np.ndarray:
    raw = np.asarray(model.predict_proba(X), dtype=float)
    aligned = np.zeros((len(X), len(CLASS_IDS)), dtype=float)
    for index, class_id in enumerate(model.classes_):
        aligned[:, int(class_id) - 1] = raw[:, index]
    return aligned


def _temperature_scale(probabilities: np.ndarray, temperature: float) -> np.ndarray:
    logits = np.log(np.clip(probabilities, 1e-12, 1.0)) / temperature
    logits -= logits.max(axis=1, keepdims=True)
    scaled = np.exp(logits)
    return scaled / scaled.sum(axis=1, keepdims=True)


def _record_global_eligibility_context(
    province_metrics: dict[str, dict],
    global_eligible: bool,
) -> None:
    """Preserve province-local evidence while recording the aggregate gate."""
    for metrics in province_metrics.values():
        metrics["local_eligible"] = bool(metrics["eligible"])
        metrics["global_gate_eligible"] = bool(global_eligible)


def _train_regression_batch(split: PooledSplit, config: PipelineConfig) -> TrainedTask:
    province_ids = sorted(split.train["province_id"].unique())
    if province_ids != sorted(split.validation["province_id"].unique()) or province_ids != sorted(split.test["province_id"].unique()):
        raise ValueError("regression provinces differ across chronological partitions")

    fixed_parameters = {
        "objective": "regression_l1",
        "num_leaves": 31,
        "max_depth": 7,
        "min_child_samples": 30,
        "subsample": 0.9,
        "colsample_bytree": 0.9,
        "reg_lambda": 2.0,
        "learning_rate": 0.025,
    }
    validation_predictions = np.full(len(split.validation), np.nan, dtype=float)
    test_predictions = np.full(len(split.test), np.nan, dtype=float)
    models: dict[str, object] = {}
    artifacts: dict[str, dict] = {}
    province_metrics: dict[str, dict] = {}
    parameters_by_province: dict[str, dict] = {}

    for province_id in province_ids:
        train_rows = split.train[split.train["province_id"] == province_id]
        validation_rows = split.validation[split.validation["province_id"] == province_id]
        test_rows = split.test[split.test["province_id"] == province_id]
        X_train, y_train_raw = _xy(train_rows, "target_pm25")
        X_validation, y_validation_raw = _xy(validation_rows, "target_pm25")
        X_test, y_test = _xy(test_rows, "target_pm25")
        baseline_train = train_rows["pm25_mean"].to_numpy(dtype=float)
        baseline_validation = validation_rows["pm25_mean"].to_numpy(dtype=float)
        baseline_test = test_rows["pm25_mean"].to_numpy(dtype=float)
        y_train = y_train_raw - baseline_train
        y_validation = y_validation_raw - baseline_validation

        validation_model = lgb.LGBMRegressor(
            n_estimators=1000,
            random_state=config.random_seed,
            n_jobs=-1,
            verbose=-1,
            **fixed_parameters,
        )
        validation_model.fit(
            X_train,
            y_train,
            eval_set=[(X_validation, y_validation)],
            callbacks=[lgb.early_stopping(80, verbose=False)],
        )
        raw_validation = np.asarray(validation_model.predict(X_validation), dtype=float)
        d1_validation = validation_rows["forecast_horizon_days"].to_numpy(dtype=int) == 1
        candidate_weights = np.linspace(0.0, 1.5, 31)
        d1_errors = np.abs(
            y_validation_raw[d1_validation][None, :]
            - baseline_validation[d1_validation][None, :]
            - candidate_weights[:, None] * raw_validation[d1_validation][None, :]
        )
        selected_weight = float(candidate_weights[np.argmin(d1_errors.mean(axis=1))])
        correction_weight = float(selected_weight) * 0.90
        local_validation_predictions = baseline_validation + correction_weight * raw_validation

        fit_rows = pd.concat([train_rows, validation_rows], ignore_index=True)
        X_fit, y_fit_raw = _xy(fit_rows, "target_pm25")
        baseline_fit = fit_rows["pm25_mean"].to_numpy(dtype=float)
        y_fit = y_fit_raw - baseline_fit
        n_estimators = int(validation_model.best_iteration_ or 1000)
        model = lgb.LGBMRegressor(
            n_estimators=n_estimators,
            random_state=config.random_seed,
            n_jobs=-1,
            verbose=-1,
            **fixed_parameters,
        ).fit(X_fit, y_fit)
        raw_test = np.asarray(model.predict(X_test), dtype=float)
        local_test_predictions = baseline_test + correction_weight * raw_test
        artifact = export_lightgbm_regressor(
            model,
            POOLED_FEATURE_COLUMNS,
            feature_version=POOLED_FEATURE_VERSION,
            prediction_transform={
                "kind": "persistence_residual_blend",
                "persistence_feature": "pm25_mean",
                "correction_weight": correction_weight,
            },
        )
        portable = np.asarray(
            [evaluate_lightgbm_regressor(row, artifact) for row in X_test[:100]],
            dtype=float,
        )
        if not np.allclose(portable, local_test_predictions[:100], atol=1e-10, rtol=1e-10):
            raise RuntimeError(
                f"portable residual LightGBM artifact differs from native predictions for {province_id}"
            )

        validation_mask = split.validation["province_id"].to_numpy() == province_id
        test_mask = split.test["province_id"].to_numpy() == province_id
        validation_predictions[validation_mask] = local_validation_predictions
        test_predictions[test_mask] = local_test_predictions
        models[province_id] = model
        artifacts[province_id] = artifact
        parameters_by_province[province_id] = {
            **fixed_parameters,
            "n_estimators": n_estimators,
            "validation_selected_correction_weight": float(selected_weight),
            "correction_weight": correction_weight,
            "selection_shrinkage": 0.90,
            "target": "target_pm25_minus_pm25_mean",
        }
        local_residuals = y_validation_raw - local_validation_predictions
        local_validation_horizons = validation_rows[
            "forecast_horizon_days"
        ].to_numpy(dtype=int)
        parameters_by_province[province_id]["residual_quantiles_by_horizon"] = {
            str(horizon): {
                name: float(value)
                for name, value in zip(
                    ("p10", "p50", "p90"),
                    np.quantile(
                        local_residuals[local_validation_horizons == horizon],
                        (0.10, 0.50, 0.90),
                    ),
                    strict=True,
                )
            }
            for horizon in DIRECT_HORIZONS
        }

        d1_test = test_rows["forecast_horizon_days"].to_numpy(dtype=int) == 1
        local_test_metrics = regression_metrics(
            y_test[d1_test],
            local_test_predictions[d1_test],
        )
        _, local_baseline = _regression_baseline(test_rows.loc[d1_test])
        local_test_metrics["skill_vs_persistence"] = (
            1.0 - local_test_metrics["mae"] / local_baseline["mae"]
        )
        local_validation_metrics = regression_metrics(
            y_validation_raw[d1_validation],
            local_validation_predictions[d1_validation],
        )
        local_eligible, local_reasons = _regression_eligibility(
            local_test_metrics,
            local_baseline,
            local_validation_metrics,
            config,
        )
        local_test_metrics.update({
            "eligible": bool(local_eligible),
            "eligibility_reasons": local_reasons,
            "baseline": local_baseline,
            "validation": local_validation_metrics,
            "correction_weight": correction_weight,
        })
        province_metrics[province_id] = local_test_metrics

    if not np.all(np.isfinite(validation_predictions)) or not np.all(np.isfinite(test_predictions)):
        raise RuntimeError("residual LightGBM did not produce complete predictions")

    y_validation = split.validation["target_pm25"].to_numpy(dtype=float)
    validation_metrics = regression_metrics(y_validation, validation_predictions)
    _, validation_baseline = _regression_baseline(split.validation)
    validation_metrics["skill_vs_persistence"] = 1.0 - validation_metrics["mae"] / validation_baseline["mae"]
    validation_metrics["selection"] = "per-province validation grid with 0.90 shrinkage"
    y_test = split.test["target_pm25"].to_numpy(dtype=float)
    test_all = regression_metrics(y_test, test_predictions)
    d1_mask = split.test["forecast_horizon_days"].to_numpy(dtype=int) == 1
    d1_rows = split.test.loc[d1_mask]
    d1_metrics = regression_metrics(y_test[d1_mask], test_predictions[d1_mask])
    _, baseline_d1 = _regression_baseline(d1_rows)
    d1_metrics["skill_vs_persistence"] = 1.0 - d1_metrics["mae"] / baseline_d1["mae"]
    d1_metrics["all_horizons"] = test_all
    d1_metrics["by_horizon"] = _metrics_by_horizon(split.test, test_predictions, task="regression")
    aggregate_eligible, reasons = _regression_eligibility(
        d1_metrics,
        baseline_d1,
        validation_metrics,
        config,
    )
    failed_provinces = [
        province_id
        for province_id, metrics in province_metrics.items()
        if not metrics["eligible"]
    ]
    global_eligible = bool(aggregate_eligible and not failed_provinces)
    if failed_provinces:
        reasons = [*reasons, f"province_gate_failed:{','.join(failed_provinces)}"]
    _record_global_eligibility_context(province_metrics, global_eligible)

    residuals = y_validation - validation_predictions
    residual_quantiles: dict[str, dict[str, float]] = {}
    validation_horizons = split.validation["forecast_horizon_days"].to_numpy(dtype=int)
    for horizon in DIRECT_HORIZONS:
        values = residuals[validation_horizons == horizon]
        residual_quantiles[str(horizon)] = {
            name: float(value)
            for name, value in zip(("p10", "p50", "p90"), np.quantile(values, (0.10, 0.50, 0.90)), strict=True)
        }
    return TrainedTask(
        "regression",
        POOLED_REGRESSION_FAMILY,
        models,
        validation_metrics,
        d1_metrics,
        baseline_d1,
        {
            "strategy": "per_province_residual_lightgbm",
            "fixed_hyperparameters": fixed_parameters,
            "by_province": parameters_by_province,
        },
        artifacts,
        residual_quantiles,
        global_eligible,
        reasons,
        province_metrics,
        validation_predictions,
        test_predictions,
    )


def train_regression(
    split: PooledSplit,
    config: PipelineConfig,
    *,
    province_results: Mapping[str, RegressionProvinceResult] | None = None,
    on_province_complete: Callable[[RegressionProvinceResult], None] | None = None,
) -> TrainedTask:
    """Train or resume province-local regressors and assemble one global task.

    Each province is an independent serializable unit. A caller can load prior
    ``RegressionProvinceResult`` objects from durable storage and persist new
    results through ``on_province_complete`` immediately after each province.
    """
    province_ids = sorted(split.train["province_id"].unique())
    if (
        province_ids != sorted(split.validation["province_id"].unique())
        or province_ids != sorted(split.test["province_id"].unique())
    ):
        raise ValueError("regression provinces differ across chronological partitions")

    completed = dict(province_results or {})
    unexpected = sorted(set(completed) - set(province_ids))
    if unexpected:
        raise ValueError(f"unexpected regression province checkpoints: {unexpected}")

    validation_predictions = np.full(len(split.validation), np.nan, dtype=float)
    test_predictions = np.full(len(split.test), np.nan, dtype=float)
    results: dict[str, RegressionProvinceResult] = {}

    for province_id in province_ids:
        validation_rows = split.validation[
            split.validation["province_id"] == province_id
        ]
        test_rows = split.test[split.test["province_id"] == province_id]
        result = completed.get(province_id)
        if result is not None:
            if result.province_id != province_id:
                raise ValueError(
                    f"regression checkpoint key {province_id} contains {result.province_id}"
                )
            if len(result.validation_predictions) != len(validation_rows):
                raise ValueError(
                    f"regression checkpoint validation rows changed for {province_id}"
                )
            if len(result.test_predictions) != len(test_rows):
                raise ValueError(
                    f"regression checkpoint test rows changed for {province_id}"
                )
            print(f"[Regression] resume completed province {province_id}", flush=True)
        else:
            local_split = PooledSplit(
                train=split.train[split.train["province_id"] == province_id].copy(),
                validation=validation_rows.copy(),
                test=test_rows.copy(),
                dropped_embargo_dates=list(split.dropped_embargo_dates),
            )
            local_task = _train_regression_batch(local_split, config)
            if local_task.validation_predictions is None or local_task.test_predictions is None:
                raise RuntimeError("province regression did not retain predictions")
            result = RegressionProvinceResult(
                province_id=province_id,
                model=local_task.model[province_id],
                runtime_artifact=local_task.runtime_artifact[province_id],
                parameters=local_task.parameters["by_province"][province_id],
                validation_predictions=np.asarray(
                    local_task.validation_predictions, dtype=float
                ),
                test_predictions=np.asarray(local_task.test_predictions, dtype=float),
                province_metrics=local_task.province_metrics[province_id],
            )
            if on_province_complete is not None:
                on_province_complete(result)
            print(f"[Regression] completed province {province_id}", flush=True)

        validation_mask = split.validation["province_id"].to_numpy() == province_id
        test_mask = split.test["province_id"].to_numpy() == province_id
        validation_predictions[validation_mask] = result.validation_predictions
        test_predictions[test_mask] = result.test_predictions
        results[province_id] = result

    if not np.all(np.isfinite(validation_predictions)) or not np.all(
        np.isfinite(test_predictions)
    ):
        raise RuntimeError("residual LightGBM did not produce complete predictions")

    y_validation = split.validation["target_pm25"].to_numpy(dtype=float)
    validation_metrics = regression_metrics(y_validation, validation_predictions)
    _, validation_baseline = _regression_baseline(split.validation)
    validation_metrics["skill_vs_persistence"] = (
        1.0 - validation_metrics["mae"] / validation_baseline["mae"]
    )
    validation_metrics["selection"] = (
        "per-province validation grid with 0.90 shrinkage"
    )
    y_test = split.test["target_pm25"].to_numpy(dtype=float)
    test_all = regression_metrics(y_test, test_predictions)
    d1_mask = split.test["forecast_horizon_days"].to_numpy(dtype=int) == 1
    d1_rows = split.test.loc[d1_mask]
    d1_metrics = regression_metrics(y_test[d1_mask], test_predictions[d1_mask])
    _, baseline_d1 = _regression_baseline(d1_rows)
    d1_metrics["skill_vs_persistence"] = (
        1.0 - d1_metrics["mae"] / baseline_d1["mae"]
    )
    d1_metrics["all_horizons"] = test_all
    d1_metrics["by_horizon"] = _metrics_by_horizon(
        split.test, test_predictions, task="regression"
    )
    aggregate_eligible, reasons = _regression_eligibility(
        d1_metrics,
        baseline_d1,
        validation_metrics,
        config,
    )
    province_metrics = {
        province_id: result.province_metrics
        for province_id, result in results.items()
    }
    failed_provinces = [
        province_id
        for province_id, metrics in province_metrics.items()
        if not metrics["eligible"]
    ]
    global_eligible = bool(aggregate_eligible and not failed_provinces)
    if failed_provinces:
        reasons = [*reasons, f"province_gate_failed:{','.join(failed_provinces)}"]
    _record_global_eligibility_context(province_metrics, global_eligible)

    residuals = y_validation - validation_predictions
    validation_horizons = split.validation["forecast_horizon_days"].to_numpy(
        dtype=int
    )
    residual_quantiles = {
        str(horizon): {
            name: float(value)
            for name, value in zip(
                ("p10", "p50", "p90"),
                np.quantile(
                    residuals[validation_horizons == horizon],
                    (0.10, 0.50, 0.90),
                ),
                strict=True,
            )
        }
        for horizon in DIRECT_HORIZONS
    }
    return TrainedTask(
        "regression",
        POOLED_REGRESSION_FAMILY,
        {province_id: result.model for province_id, result in results.items()},
        validation_metrics,
        d1_metrics,
        baseline_d1,
        {
            "strategy": "per_province_residual_lightgbm",
            "fixed_hyperparameters": {
                key: value
                for key, value in next(iter(results.values())).parameters.items()
                if key
                not in {
                    "n_estimators",
                    "validation_selected_correction_weight",
                    "correction_weight",
                    "selection_shrinkage",
                    "target",
                    "residual_quantiles_by_horizon",
                }
            },
            "by_province": {
                province_id: result.parameters
                for province_id, result in results.items()
            },
        },
        {
            province_id: result.runtime_artifact
            for province_id, result in results.items()
        },
        residual_quantiles,
        global_eligible,
        reasons,
        province_metrics,
        validation_predictions,
        test_predictions,
    )


def train_classification(
    split: PooledSplit,
    config: PipelineConfig,
    *,
    cv_fold_results: Mapping[int, ClassificationFoldResult] | None = None,
    on_cv_fold_complete: Callable[[ClassificationFoldResult], None] | None = None,
) -> TrainedTask:
    X_train, y_train = _xy(split.train, "target_air_quality_class")
    X_validation, y_validation = _xy(split.validation, "target_air_quality_class")
    cv_folds = pooled_walk_forward_folds(split.train, config.cv_splits)
    cached_folds = dict(cv_fold_results or {})
    unexpected_folds = sorted(set(cached_folds) - set(range(len(cv_folds))))
    if unexpected_folds:
        raise ValueError(
            f"unexpected classification fold checkpoints: {unexpected_folds}"
        )
    candidate = dict(CLASSIFICATION_FIXED_PARAMETERS)
    fold_truth = []
    fold_raw_probabilities = []
    for fold_index, (fold_train, fold_validation) in enumerate(cv_folds):
        fold_result = cached_folds.get(fold_index)
        if fold_result is not None:
            if fold_result.fold_index != fold_index:
                raise ValueError(
                    f"classification fold checkpoint {fold_index} contains "
                    f"fold {fold_result.fold_index}"
                )
            if len(fold_result.truth) != len(fold_validation):
                raise ValueError(
                    f"classification fold rows changed for fold {fold_index}"
                )
            if fold_result.raw_probabilities.shape != (
                len(fold_validation),
                len(CLASS_IDS),
            ):
                raise ValueError(
                    f"classification probability shape changed for fold {fold_index}"
                )
            print(f"[Classification] resume completed CV fold {fold_index + 1}", flush=True)
        else:
            X_fold_train, y_fold_train = _xy(
                fold_train, "target_air_quality_class"
            )
            X_fold_validation, y_fold_validation = _xy(
                fold_validation, "target_air_quality_class"
            )
            fold_model = RandomForestClassifier(
                class_weight="balanced_subsample",
                random_state=config.random_seed,
                n_jobs=-1,
                **candidate,
            )
            fold_model.fit(X_fold_train, y_fold_train)
            fold_result = ClassificationFoldResult(
                fold_index=fold_index,
                truth=np.asarray(y_fold_validation),
                raw_probabilities=_aligned_rf_probabilities(
                    fold_model, X_fold_validation
                ),
            )
            if on_cv_fold_complete is not None:
                on_cv_fold_complete(fold_result)
            print(f"[Classification] completed CV fold {fold_index + 1}", flush=True)
        fold_truth.append(np.asarray(fold_result.truth))
        fold_raw_probabilities.append(
            np.asarray(fold_result.raw_probabilities, dtype=float)
        )

    truth = np.concatenate(fold_truth)
    raw_probabilities = np.concatenate(fold_raw_probabilities)
    best: tuple[tuple[float, ...], dict, dict] | None = None
    for temperature in CLASSIFICATION_TEMPERATURES:
        scaled_probabilities = _temperature_scale(raw_probabilities, temperature)
        cv_predictions = np.asarray(CLASS_IDS)[
            np.argmax(scaled_probabilities, axis=1)
        ]
        metrics = classification_metrics(truth, cv_predictions, scaled_probabilities)
        critical = min(
            metrics["per_class"][str(class_id)]["recall"]
            if metrics["per_class"][str(class_id)]["support"]
            >= config.critical_class_minimum_support
            else 0.0
            for class_id in (4, 5)
        )
        key = (
            metrics["macro_f1"],
            critical,
            metrics["balanced_accuracy"],
            -float(metrics["log_loss"] or 1e9),
        )
        if best is None or key > best[0]:
            best = (key, {**candidate, "temperature": temperature}, metrics)
    assert best is not None
    parameters = best[1]

    validation_model = RandomForestClassifier(
        class_weight="balanced_subsample",
        random_state=config.random_seed,
        n_jobs=-1,
        **{key: value for key, value in parameters.items() if key != "temperature"},
    ).fit(X_train, y_train)
    validation_probabilities = _temperature_scale(
        _aligned_rf_probabilities(validation_model, X_validation),
        float(parameters["temperature"]),
    )
    validation_predictions = np.asarray(CLASS_IDS)[np.argmax(validation_probabilities, axis=1)]
    validation_metrics = classification_metrics(y_validation, validation_predictions, validation_probabilities)
    validation_metrics["rolling_cv"] = best[2]
    validation_metrics["rolling_cv_policy"] = {
        "model_parameters": candidate,
        "folds": len(cv_folds),
        "model_parameter_candidates": 1,
        "temperature_candidates": list(CLASSIFICATION_TEMPERATURES),
        "selection": "one reviewed Random Forest configuration; temperature only",
    }

    fit_rows = pd.concat([split.train, split.validation], ignore_index=True)
    X_fit, y_fit = _xy(fit_rows, "target_air_quality_class")
    model = RandomForestClassifier(
        class_weight="balanced_subsample",
        random_state=config.random_seed,
        n_jobs=-1,
        **{key: value for key, value in parameters.items() if key != "temperature"},
    )
    model.fit(X_fit, y_fit)
    X_test, y_test = _xy(split.test, "target_air_quality_class")
    probabilities = _temperature_scale(
        _aligned_rf_probabilities(model, X_test),
        float(parameters["temperature"]),
    )
    predictions = np.asarray(CLASS_IDS)[np.argmax(probabilities, axis=1)]
    d1_mask = split.test["forecast_horizon_days"].to_numpy(dtype=int) == 1
    d1_rows = split.test.loc[d1_mask]
    d1_metrics = classification_metrics(y_test[d1_mask], predictions[d1_mask], probabilities[d1_mask])
    _, _, baseline_d1 = _classification_baseline(d1_rows)
    train_probabilities = _temperature_scale(
        _aligned_rf_probabilities(model, X_fit),
        float(parameters["temperature"]),
    )
    train_predictions = np.asarray(CLASS_IDS)[np.argmax(train_probabilities, axis=1)]
    train_metrics = classification_metrics(y_fit, train_predictions, train_probabilities)
    eligible, reasons, warnings = _classification_eligibility(
        train_metrics,
        d1_metrics,
        baseline_d1,
        probabilities[d1_mask],
        config,
    )
    reasons = [*reasons, *[f"warning:{warning}" for warning in warnings]]

    artifact = export_random_forest_classifier(
        model,
        POOLED_FEATURE_COLUMNS,
        feature_version=POOLED_FEATURE_VERSION,
        threshold_version=THRESHOLD_VERSION,
        temperature=float(parameters["temperature"]),
    )
    portable = np.asarray([
        [evaluate_random_forest_classifier(row, artifact)[str(class_id)] for class_id in CLASS_IDS]
        for row in X_test[:100]
    ])
    if not np.allclose(portable, probabilities[:100], atol=1e-10, rtol=1e-10):
        raise RuntimeError("portable Random Forest artifact differs from native probabilities")

    province_metrics: dict[str, dict] = {}
    for province_id in sorted(d1_rows["province_id"].unique()):
        mask = d1_mask & (split.test["province_id"].to_numpy() == province_id)
        metrics = classification_metrics(y_test[mask], predictions[mask], probabilities[mask])
        _, _, baseline = _classification_baseline(split.test.loc[mask])
        metrics["eligible"] = bool(
            eligible
            and metrics["test_rows"] >= config.minimum_test_rows
            and metrics["macro_f1"] > baseline["macro_f1"]
            and metrics["balanced_accuracy"] > baseline["balanced_accuracy"]
            and metrics["weighted_f1"] > baseline["weighted_f1"]
        )
        metrics["baseline"] = baseline
        province_metrics[province_id] = metrics
    d1_metrics["all_horizons"] = classification_metrics(y_test, predictions, probabilities)
    return TrainedTask(
        "classification",
        POOLED_CLASSIFICATION_FAMILY,
        model,
        validation_metrics,
        d1_metrics,
        baseline_d1,
        parameters,
        artifact,
        {},
        eligible,
        reasons,
        province_metrics,
    )


def _period(rows: pd.DataFrame) -> tuple[str, str]:
    return rows["date"].min().date().isoformat(), rows["target_date"].max().date().isoformat()


def _class_distribution(values: np.ndarray) -> dict[str, int]:
    return {str(class_id): int(np.sum(values == class_id)) for class_id in CLASS_IDS}


def build_registry_rows(
    run_id: str,
    province_ids: tuple[str, ...],
    split: PooledSplit,
    regression: TrainedTask,
    classification: TrainedTask,
    audit: dict,
) -> list[dict]:
    rows: list[dict] = []
    now = datetime.now(timezone.utc).isoformat()
    train_start, train_end = _period(split.train)
    validation_start, validation_end = _period(split.validation)
    test_start, test_end = _period(split.test)
    for province_id in province_ids:
        for task in (regression, classification):
            metrics = task.province_metrics[province_id]
            local_eligible = bool(metrics.get("local_eligible", metrics["eligible"]))
            eligible = bool(task.global_eligible and local_eligible)
            name = REGRESSION_MODEL_NAME if task.task_type == "regression" else CLASSIFICATION_MODEL_NAME
            is_pooled = task.task_type == "classification"
            task_parameters = (
                task.parameters["by_province"][province_id]
                if task.task_type == "regression"
                else task.parameters
            )
            model_params = {
                "task_type": task.task_type,
                "teacher_model_family": task.family,
                "serving_model_family": task.family,
                "runtime_kind": ARTIFACT_SCHEMA,
                "feature_cols": list(POOLED_FEATURE_COLUMNS),
                "feature_version": POOLED_FEATURE_VERSION,
                "feature_provenance": POOLED_FEATURE_PROVENANCE,
                "pooled_model": is_pooled,
                "pool_provinces": list(province_ids) if is_pooled else [province_id],
                "target_strategy": (
                    "direct_residual_from_persistence"
                    if task.task_type == "regression"
                    else "direct_observed_horizon"
                ),
                "trained_horizons": list(DIRECT_HORIZONS),
                "validated_horizons": [1],
                "fallback": {
                    "model_name": FALLBACK_MODEL_NAME,
                    "strategy": FALLBACK_STRATEGY,
                    "window_days": FALLBACK_WINDOW_DAYS,
                    "trigger": "no_eligible_active_regressor_or_invalid_artifact",
                },
                "hyperparameters": task_parameters,
                "global_test_metrics": task.test_metrics,
                "province_test_metrics": metrics,
                "audit": audit,
            }
            if task.task_type == "regression":
                local_quantiles = task_parameters["residual_quantiles_by_horizon"]
                model_params["residual_quantiles_by_horizon"] = local_quantiles
                model_params["residual_quantiles"] = local_quantiles["1"]
                model_params["correction_weight"] = task_parameters[
                    "correction_weight"
                ]
            else:
                model_params["threshold_version"] = THRESHOLD_VERSION
                model_params["class_mapping"] = class_mapping()
                model_params["serving_policy"] = "classifier_with_regression_fallback"
            rows.append({
                "run_id": run_id,
                "province_id": province_id,
                "task_type": task.task_type,
                "model_name": name,
                "model_family": task.family,
                "teacher_model_family": task.family,
                "serving_model_family": task.family,
                "model_version": MODEL_VERSION,
                "artifact_ref": (
                    f"artifacts/{run_id}/{province_id}/regression/model.joblib"
                    if task.task_type == "regression"
                    else f"artifacts/{run_id}/pooled/classification/model.joblib"
                ),
                "feature_schema": {"columns": list(POOLED_FEATURE_COLUMNS), "ordered": True, "count": len(POOLED_FEATURE_COLUMNS)},
                "feature_version": POOLED_FEATURE_VERSION,
                "threshold_version": THRESHOLD_VERSION,
                "train_start": train_start,
                "train_end": train_end,
                "validation_start": validation_start,
                "validation_end": validation_end,
                "test_start": test_start,
                "test_end": test_end,
                "training_rows": (
                    int((split.train["province_id"] == province_id).sum())
                    if task.task_type == "regression"
                    else len(split.train)
                ),
                "validation_rows": (
                    int((split.validation["province_id"] == province_id).sum())
                    if task.task_type == "regression"
                    else len(split.validation)
                ),
                "test_rows": metrics["test_rows"],
                "metrics": metrics,
                "baseline_metrics": metrics["baseline"],
                "class_distribution": _class_distribution(
                    pd.concat([split.train, split.validation, split.test])["target_air_quality_class"].to_numpy(dtype=int)
                ) if task.task_type == "classification" else {},
                "eligibility_status": eligible,
                "eligibility_reason": (
                    "eligible"
                    if eligible
                    else ",".join(
                        reason
                        for reason in (
                            metrics.get("eligibility_reasons", [])
                            if not local_eligible
                            else task.global_reasons
                        )
                        if reason != "eligible"
                    )
                    or "province_gate_failed"
                ),
                "evidence_status": "validated" if eligible else ("insufficient_evidence" if task.task_type == "classification" else "ineligible"),
                "is_active": False,
                "trained_at": now,
                "source": OBSERVED_VIEW,
                "code_version": _git_sha(),
                "mae": metrics.get("mae"),
                "rmse": metrics.get("rmse"),
                "r2": metrics.get("r2"),
                "model_params": model_params,
            })
    return rows


def _versions() -> dict[str, str]:
    versions = {}
    for name in ("numpy", "pandas", "scikit-learn", "lightgbm", "joblib", "supabase"):
        try:
            versions[name] = importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError:
            versions[name] = "unknown"
    return versions


def save_artifacts(result: PooledResult, root: Path, config: PipelineConfig) -> dict[str, dict]:
    output: dict[str, dict] = {}
    for task in (result.regression, result.classification):
        if task.task_type == "regression":
            entries = [
                (
                    province_id,
                    task.model[province_id],
                    task.runtime_artifact[province_id],
                    root / result.run_id / province_id / "regression",
                )
                for province_id in result.province_ids
            ]
        else:
            entries = [(
                "pooled",
                task.model,
                task.runtime_artifact,
                root / result.run_id / "pooled" / "classification",
            )]
        output[task.task_type] = {}
        for artifact_key, native_model, runtime_artifact, target in entries:
            target.mkdir(parents=True, exist_ok=True)
            native_path = target / "model.joblib"
            runtime_path = target / "runtime.json.gz"
            joblib.dump(native_model, native_path)
            runtime_payload = encode_artifact(runtime_artifact)
            runtime_path.write_bytes(runtime_payload)
            native_sha = hashlib.sha256(native_path.read_bytes()).hexdigest()
            runtime_sha = hashlib.sha256(runtime_payload).hexdigest()
            metadata = {
                "run_id": result.run_id,
                "artifact_key": artifact_key,
                "task_type": task.task_type,
                "model_family": task.family,
                "model_version": MODEL_VERSION,
                "feature_version": POOLED_FEATURE_VERSION,
                "features": list(POOLED_FEATURE_COLUMNS),
                "global_metrics": task.test_metrics,
                "baseline_metrics": task.baseline_metrics,
                "province_metrics": (
                    task.province_metrics.get(artifact_key)
                    if artifact_key != "pooled"
                    else task.province_metrics
                ),
                "global_eligibility": {"eligible": task.global_eligible, "reasons": task.global_reasons},
                "native_artifact_sha256": native_sha,
                "runtime_artifact_sha256": runtime_sha,
                "libraries": _versions(),
                "python": sys.version.split()[0],
                "git_sha": _git_sha(),
                "configuration": {
                    "minimum_origin_dates": config.minimum_rows,
                    "classification_cv_splits": config.cv_splits,
                    "fallback": {
                        "model_name": FALLBACK_MODEL_NAME,
                        "strategy": config.fallback_strategy,
                        "window_days": config.fallback_window_days,
                    },
                },
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            (target / "metadata.json").write_text(
                json.dumps(_json_safe(metadata), ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            output[task.task_type][artifact_key] = {
                "native_path": native_path,
                "runtime_path": runtime_path,
                "native_sha256": native_sha,
                "runtime_sha256": runtime_sha,
            }
    return output


def upload_and_register(
    sb: Client,
    result: PooledResult,
    artifacts: dict[str, dict],
    *,
    activate: bool,
) -> None:
    bucket = sb.storage.from_("model-artifacts")
    dependency_lock = _versions()
    for task_type, task_artifacts in artifacts.items():
        for artifact_key, paths in task_artifacts.items():
            base = (
                f"{result.run_id}/{artifact_key}/regression"
                if task_type == "regression"
                else f"{result.run_id}/pooled/classification"
            )
            native_remote = f"{base}/model.joblib"
            runtime_remote = f"{base}/runtime.json.gz"
            with paths["native_path"].open("rb") as handle:
                bucket.upload(native_remote, handle, {"content-type": "application/octet-stream", "upsert": "false"})
            with paths["runtime_path"].open("rb") as handle:
                bucket.upload(runtime_remote, handle, {"content-type": "application/octet-stream", "upsert": "false"})
            for row in result.registry_rows:
                if row["task_type"] != task_type:
                    continue
                if task_type == "regression" and row["province_id"] != artifact_key:
                    continue
                row.update({
                    "artifact_uri": f"storage://model-artifacts/{native_remote}",
                    "artifact_sha256": paths["native_sha256"],
                    "artifact_byte_size": paths["native_path"].stat().st_size,
                    "artifact_content_type": "application/octet-stream",
                    "runtime_artifact_uri": f"storage://model-artifacts/{runtime_remote}",
                    "runtime_artifact_sha256": paths["runtime_sha256"],
                    "runtime_artifact_byte_size": paths["runtime_path"].stat().st_size,
                    "runtime_artifact_format": "json+gzip",
                    "dependency_lock": dependency_lock,
                })
    sb.rpc("fn_upsert_model_registry", {"rows": result.registry_rows}).execute()
    if activate:
        sb.rpc(
            "fn_activate_pooled_dual_model_run",
            {
                "p_run_id": result.run_id,
                "p_required_provinces": len(result.province_ids),
            },
        ).execute()


def main() -> int:
    args = parse_args()
    config = PipelineConfig(minimum_rows=args.min_rows, cv_splits=args.cv_splits, artifact_directory=args.artifact_dir)
    config.validate()
    province_ids = tuple(args.province or POOLED_PROVINCE_IDS)
    allowed_sources = {
        value.strip().lower()
        for value in (
            args.allowed_source
            or os.environ.get("TRAINING_ALLOWED_SOURCES", ",".join(ALLOWED_SOURCES_DEFAULT)).split(",")
        )
        if value.strip()
    }
    sb = get_client()
    observed = filter_training_rows(fetch_observed_rows(sb, province_ids), allowed_sources)
    metadata = fetch_province_metadata(sb, province_ids)
    examples = build_pooled_examples(observed, metadata)
    split = pooled_chronological_split(examples, config)
    regression = train_regression(split, config)
    classification = train_classification(split, config)
    run_id = str(uuid.uuid4())
    audit = {
        "strategy": "pooled_split_local_residual_regression_and_pooled_classification",
        "pool_provinces": list(province_ids),
        "feature_version": POOLED_FEATURE_VERSION,
        "feature_provenance": POOLED_FEATURE_PROVENANCE,
        "target_source": "observed future PM2.5",
        "target_horizons": list(DIRECT_HORIZONS),
        "final_test_untouched_during_tuning": True,
        "same_date_same_partition": True,
        "embargo_days": max(DIRECT_HORIZONS),
        "dropped_embargo_dates": split.dropped_embargo_dates,
        "rows": {"train": len(split.train), "validation": len(split.validation), "test": len(split.test)},
    }
    registry_rows = build_registry_rows(run_id, province_ids, split, regression, classification, audit)
    result = PooledResult(run_id, province_ids, split, regression, classification, registry_rows, audit)
    artifacts = save_artifacts(result, args.artifact_dir, config)
    if args.register and not args.dry_run and not args.shadow:
        upload_and_register(sb, result, artifacts, activate=args.activate)

    summary = {
        "run_id": run_id,
        "mode": "register" if args.register and not args.dry_run and not args.shadow else ("shadow" if args.shadow else "dry-run"),
        "activate": bool(args.activate),
        "pool_provinces": list(province_ids),
        "regression": {
            "model": REGRESSION_MODEL_NAME,
            "global_eligible": regression.global_eligible,
            "eligible_provinces": [key for key, value in regression.province_metrics.items() if value["eligible"]],
            "metrics": regression.test_metrics,
        },
        "classification": {
            "model": CLASSIFICATION_MODEL_NAME,
            "global_eligible": classification.global_eligible,
            "eligible_provinces": [key for key, value in classification.province_metrics.items() if value["eligible"]],
            "metrics": classification.test_metrics,
        },
        "audit": audit,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    summary_path = args.artifact_dir / run_id / "run_summary.json"
    summary_path.write_text(json.dumps(_json_safe(summary), ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(_json_safe(summary), ensure_ascii=False))
    print(f"RUN_SUMMARY={summary_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
