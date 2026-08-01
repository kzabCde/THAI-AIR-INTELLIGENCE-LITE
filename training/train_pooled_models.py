#!/usr/bin/env python3
"""Train pooled LightGBM PM2.5 regression and Random Forest classification.

All provinces for the same origin date stay in the same chronological split.
The targets are built directly from observed future PM2.5 for horizons D+1 to
D+7.  Candidates are registered inactive; activation remains an explicit,
per-task and per-province operation guarded by final-test evidence.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import os
import sys
import uuid
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
    POOLED_PROVINCE_COLUMNS,
    POOLED_PROVINCE_IDS,
    POOLED_REGRESSION_FAMILY,
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
MODEL_VERSION = "pooled-dual-pm25-v1"
REGRESSION_MODEL_NAME = "lightgbm-pm25-pooled-v1"
CLASSIFICATION_MODEL_NAME = "random-forest-aqi-classifier-pooled-v1"


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
    parser.add_argument("--min-rows", type=int, default=180, help="minimum unique origin dates")
    parser.add_argument("--cv-splits", type=int, default=3)
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
    embargo_days: int = max(DIRECT_HORIZONS),
) -> PooledSplit:
    dates = pd.Index(sorted(pd.to_datetime(examples["date"]).unique()))
    if len(dates) < config.minimum_rows:
        raise ValueError(
            f"insufficient unique origin dates: {len(dates)} < {config.minimum_rows}"
        )
    test_days = max(config.minimum_test_rows, round(len(dates) * config.test_fraction))
    validation_days = max(
        config.minimum_validation_rows,
        round(len(dates) * config.validation_fraction),
    )
    test_start = len(dates) - test_days
    validation_end = test_start - embargo_days
    validation_start = validation_end - validation_days
    train_end = validation_start - embargo_days
    if train_end < 90:
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


def train_regression(split: PooledSplit, config: PipelineConfig) -> TrainedTask:
    X_train, y_train = _xy(split.train, "target_pm25")
    X_validation, y_validation = _xy(split.validation, "target_pm25")
    cv_folds = pooled_walk_forward_folds(split.train, config.cv_splits)
    candidates = (
        {"num_leaves": 15, "max_depth": 5, "min_child_samples": 20},
        {"num_leaves": 31, "max_depth": 7, "min_child_samples": 20},
        {"num_leaves": 31, "max_depth": -1, "min_child_samples": 35},
    )
    best: tuple[tuple[float, float], dict, dict] | None = None
    for candidate in candidates:
        fold_metrics = []
        fold_iterations = []
        for fold_train, fold_validation in cv_folds:
            X_fold_train, y_fold_train = _xy(fold_train, "target_pm25")
            X_fold_validation, y_fold_validation = _xy(fold_validation, "target_pm25")
            model = lgb.LGBMRegressor(
                n_estimators=800,
                learning_rate=0.03,
                subsample=0.85,
                colsample_bytree=0.85,
                reg_lambda=1.0,
                random_state=config.random_seed,
                n_jobs=-1,
                verbose=-1,
                **candidate,
            )
            model.fit(
                X_fold_train,
                y_fold_train,
                eval_set=[(X_fold_validation, y_fold_validation)],
                callbacks=[lgb.early_stopping(50, verbose=False)],
            )
            prediction = model.predict(X_fold_validation)
            metrics = regression_metrics(y_fold_validation, prediction)
            _, baseline = _regression_baseline(fold_validation)
            metrics["skill_vs_persistence"] = 1.0 - metrics["mae"] / baseline["mae"]
            fold_metrics.append(metrics)
            fold_iterations.append(int(model.best_iteration_ or 800))
        cv_metrics = {
            "folds": fold_metrics,
            "mean_skill_vs_persistence": float(np.mean([row["skill_vs_persistence"] for row in fold_metrics])),
            "mean_rmse": float(np.mean([row["rmse"] for row in fold_metrics])),
        }
        key = (cv_metrics["mean_skill_vs_persistence"], -cv_metrics["mean_rmse"])
        if best is None or key > best[0]:
            params = {**candidate, "cv_n_estimators_median": int(np.median(fold_iterations))}
            best = (key, params, cv_metrics)
    assert best is not None
    parameters = best[1]

    validation_model = lgb.LGBMRegressor(
        n_estimators=800,
        learning_rate=0.03,
        subsample=0.85,
        colsample_bytree=0.85,
        reg_lambda=1.0,
        random_state=config.random_seed,
        n_jobs=-1,
        verbose=-1,
        **{key: parameters[key] for key in ("num_leaves", "max_depth", "min_child_samples")},
    )
    validation_model.fit(
        X_train,
        y_train,
        eval_set=[(X_validation, y_validation)],
        callbacks=[lgb.early_stopping(50, verbose=False)],
    )
    validation_predictions = np.asarray(validation_model.predict(X_validation), dtype=float)
    validation_metrics = regression_metrics(y_validation, validation_predictions)
    _, validation_baseline = _regression_baseline(split.validation)
    validation_metrics["skill_vs_persistence"] = 1.0 - validation_metrics["mae"] / validation_baseline["mae"]
    validation_metrics["rolling_cv"] = best[2]
    parameters["n_estimators"] = int(validation_model.best_iteration_ or parameters["cv_n_estimators_median"])

    fit_rows = pd.concat([split.train, split.validation], ignore_index=True)
    X_fit, y_fit = _xy(fit_rows, "target_pm25")
    model = lgb.LGBMRegressor(
        n_estimators=parameters["n_estimators"],
        learning_rate=0.03,
        subsample=0.85,
        colsample_bytree=0.85,
        reg_lambda=1.0,
        random_state=config.random_seed,
        n_jobs=-1,
        verbose=-1,
        **{key: parameters[key] for key in ("num_leaves", "max_depth", "min_child_samples")},
    ).fit(X_fit, y_fit)
    X_test, y_test = _xy(split.test, "target_pm25")
    predictions = np.asarray(model.predict(X_test), dtype=float)
    test_all = regression_metrics(y_test, predictions)
    d1_mask = split.test["forecast_horizon_days"].to_numpy(dtype=int) == 1
    d1_rows = split.test.loc[d1_mask]
    d1_metrics = regression_metrics(y_test[d1_mask], predictions[d1_mask])
    _, baseline_d1 = _regression_baseline(d1_rows)
    d1_metrics["skill_vs_persistence"] = 1.0 - d1_metrics["mae"] / baseline_d1["mae"]
    d1_metrics["all_horizons"] = test_all
    d1_metrics["by_horizon"] = _metrics_by_horizon(split.test, predictions, task="regression")
    eligible, reasons = _regression_eligibility(
        d1_metrics,
        baseline_d1,
        validation_metrics,
        config,
    )

    residuals = y_validation - validation_predictions
    residual_quantiles: dict[str, dict[str, float]] = {}
    validation_horizons = split.validation["forecast_horizon_days"].to_numpy(dtype=int)
    for horizon in DIRECT_HORIZONS:
        values = residuals[validation_horizons == horizon]
        residual_quantiles[str(horizon)] = {
            name: float(value)
            for name, value in zip(("p10", "p50", "p90"), np.quantile(values, (0.10, 0.50, 0.90)), strict=True)
        }
    artifact = export_lightgbm_regressor(
        model,
        POOLED_FEATURE_COLUMNS,
        feature_version=POOLED_FEATURE_VERSION,
    )
    portable = np.asarray(
        [evaluate_lightgbm_regressor(row, artifact) for row in X_test[:100]],
        dtype=float,
    )
    if not np.allclose(portable, predictions[:100], atol=1e-10, rtol=1e-10):
        raise RuntimeError("portable LightGBM artifact differs from native predictions")

    province_metrics: dict[str, dict] = {}
    for province_id in sorted(d1_rows["province_id"].unique()):
        mask = d1_mask & (split.test["province_id"].to_numpy() == province_id)
        metrics = regression_metrics(y_test[mask], predictions[mask])
        _, baseline = _regression_baseline(split.test.loc[mask])
        metrics["skill_vs_persistence"] = 1.0 - metrics["mae"] / baseline["mae"]
        metrics["eligible"] = bool(
            eligible
            and metrics["test_rows"] >= config.minimum_test_rows
            and metrics["skill_vs_persistence"] >= config.regression_minimum_skill
            and metrics["mae"] < baseline["mae"]
        )
        metrics["baseline"] = baseline
        province_metrics[province_id] = metrics
    return TrainedTask(
        "regression",
        POOLED_REGRESSION_FAMILY,
        model,
        validation_metrics,
        d1_metrics,
        baseline_d1,
        parameters,
        artifact,
        residual_quantiles,
        eligible,
        reasons,
        province_metrics,
    )


def train_classification(split: PooledSplit, config: PipelineConfig) -> TrainedTask:
    X_train, y_train = _xy(split.train, "target_air_quality_class")
    X_validation, y_validation = _xy(split.validation, "target_air_quality_class")
    cv_folds = pooled_walk_forward_folds(split.train, config.cv_splits)
    candidates = (
        {"n_estimators": 400, "max_depth": 14, "min_samples_leaf": 2, "max_features": "sqrt"},
        {"n_estimators": 500, "max_depth": None, "min_samples_leaf": 3, "max_features": "sqrt"},
        {"n_estimators": 400, "max_depth": 18, "min_samples_leaf": 4, "max_features": 0.7},
    )
    best: tuple[tuple[float, ...], dict, dict] | None = None
    for candidate in candidates:
        fold_truth = []
        fold_raw_probabilities = []
        for fold_train, fold_validation in cv_folds:
            X_fold_train, y_fold_train = _xy(fold_train, "target_air_quality_class")
            X_fold_validation, y_fold_validation = _xy(fold_validation, "target_air_quality_class")
            model = RandomForestClassifier(
                class_weight="balanced_subsample",
                random_state=config.random_seed,
                n_jobs=-1,
                **candidate,
            )
            model.fit(X_fold_train, y_fold_train)
            fold_truth.append(y_fold_validation)
            fold_raw_probabilities.append(_aligned_rf_probabilities(model, X_fold_validation))
        truth = np.concatenate(fold_truth)
        raw_probabilities = np.concatenate(fold_raw_probabilities)
        for temperature in (0.75, 1.0, 1.25, 1.5):
            probabilities = _temperature_scale(raw_probabilities, temperature)
            predictions = np.asarray(CLASS_IDS)[np.argmax(probabilities, axis=1)]
            metrics = classification_metrics(truth, predictions, probabilities)
            critical = min(
                metrics["per_class"][str(class_id)]["recall"]
                if metrics["per_class"][str(class_id)]["support"] >= config.critical_class_minimum_support
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
            eligible = bool(metrics["eligible"])
            name = REGRESSION_MODEL_NAME if task.task_type == "regression" else CLASSIFICATION_MODEL_NAME
            model_params = {
                "task_type": task.task_type,
                "teacher_model_family": task.family,
                "serving_model_family": task.family,
                "runtime_kind": ARTIFACT_SCHEMA,
                "feature_cols": list(POOLED_FEATURE_COLUMNS),
                "feature_version": POOLED_FEATURE_VERSION,
                "feature_provenance": POOLED_FEATURE_PROVENANCE,
                "pooled_model": True,
                "pool_provinces": list(province_ids),
                "target_strategy": "direct_observed_horizon",
                "trained_horizons": list(DIRECT_HORIZONS),
                "validated_horizons": [1],
                "fallback": {
                    "model_name": FALLBACK_MODEL_NAME,
                    "strategy": FALLBACK_STRATEGY,
                    "window_days": FALLBACK_WINDOW_DAYS,
                    "trigger": "no_eligible_active_regressor_or_invalid_artifact",
                },
                "hyperparameters": task.parameters,
                "global_test_metrics": task.test_metrics,
                "province_test_metrics": metrics,
                "audit": audit,
            }
            if task.task_type == "regression":
                model_params["residual_quantiles_by_horizon"] = task.residual_quantiles_by_horizon
                model_params["residual_quantiles"] = task.residual_quantiles_by_horizon["1"]
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
                "artifact_ref": f"artifacts/{run_id}/pooled/{task.task_type}/model.joblib",
                "feature_schema": {"columns": list(POOLED_FEATURE_COLUMNS), "ordered": True, "count": len(POOLED_FEATURE_COLUMNS)},
                "feature_version": POOLED_FEATURE_VERSION,
                "threshold_version": THRESHOLD_VERSION,
                "train_start": train_start,
                "train_end": train_end,
                "validation_start": validation_start,
                "validation_end": validation_end,
                "test_start": test_start,
                "test_end": test_end,
                "training_rows": len(split.train),
                "validation_rows": len(split.validation),
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
                    else (
                        ",".join(reason for reason in task.global_reasons if reason != "eligible")
                        or "province_gate_failed"
                    )
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
        target = root / result.run_id / "pooled" / task.task_type
        target.mkdir(parents=True, exist_ok=True)
        native_path = target / "model.joblib"
        runtime_path = target / "runtime.json.gz"
        joblib.dump(task.model, native_path)
        runtime_payload = encode_artifact(task.runtime_artifact)
        runtime_path.write_bytes(runtime_payload)
        native_sha = hashlib.sha256(native_path.read_bytes()).hexdigest()
        runtime_sha = hashlib.sha256(runtime_payload).hexdigest()
        metadata = {
            "run_id": result.run_id,
            "task_type": task.task_type,
            "model_family": task.family,
            "model_version": MODEL_VERSION,
            "feature_version": POOLED_FEATURE_VERSION,
            "features": list(POOLED_FEATURE_COLUMNS),
            "metrics": task.test_metrics,
            "baseline_metrics": task.baseline_metrics,
            "province_metrics": task.province_metrics,
            "global_eligibility": {"eligible": task.global_eligible, "reasons": task.global_reasons},
            "native_artifact_sha256": native_sha,
            "runtime_artifact_sha256": runtime_sha,
            "libraries": _versions(),
            "python": sys.version.split()[0],
            "git_sha": _git_sha(),
            "configuration": {
                "minimum_origin_dates": config.minimum_rows,
                "cv_splits": config.cv_splits,
                "fallback": {
                    "model_name": FALLBACK_MODEL_NAME,
                    "strategy": config.fallback_strategy,
                    "window_days": config.fallback_window_days,
                },
            },
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        (target / "metadata.json").write_text(json.dumps(_json_safe(metadata), ensure_ascii=False, indent=2), encoding="utf-8")
        output[task.task_type] = {
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
    for task_type, paths in artifacts.items():
        base = f"{result.run_id}/pooled/{task_type}"
        native_remote = f"{base}/model.joblib"
        runtime_remote = f"{base}/runtime.json.gz"
        with paths["native_path"].open("rb") as handle:
            bucket.upload(native_remote, handle, {"content-type": "application/octet-stream", "upsert": "false"})
        with paths["runtime_path"].open("rb") as handle:
            bucket.upload(runtime_remote, handle, {"content-type": "application/octet-stream", "upsert": "false"})
        for row in result.registry_rows:
            if row["task_type"] != task_type:
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
        for row in result.registry_rows:
            if not row["eligibility_status"]:
                continue
            sb.rpc("fn_activate_model_task", {
                "p_province_id": row["province_id"],
                "p_task_type": row["task_type"],
                "p_model_name": row["model_name"],
                "p_run_id": row["run_id"],
                "p_allow_ineligible": False,
            }).execute()


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
        "strategy": "pooled_purged_chronological_direct_horizon",
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
