#!/usr/bin/env python3
"""Legacy per-province dual trainer retained as a rollback path.

The classification target is derived from the *actual* next-day PM2.5 value.
Model selection uses chronological validation data; the most recent test split
remains untouched until final evaluation. Registration is inactive by default.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import math
import os
import subprocess
import sys
import traceback
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.ensemble import (
    RandomForestClassifier,
    RandomForestRegressor,
)
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    confusion_matrix,
    log_loss,
    mean_absolute_error,
    mean_squared_error,
    precision_recall_fscore_support,
    r2_score,
)
from sklearn.preprocessing import StandardScaler
from sklearn.utils.class_weight import compute_sample_weight
from supabase import Client, create_client

from training.dual_model_config import (
    FEATURE_PROVENANCE,
    FEATURE_COLUMNS,
    FEATURE_VERSION,
    MODEL_FAMILIES,
    PipelineConfig,
    SOURCE_FEATURE_COLUMNS,
)
from training.pm25_classes import (
    CLASS_IDS,
    THRESHOLD_VERSION,
    class_mapping,
    classes_for_pm25,
    normalize_probabilities,
)

OBSERVED_VIEW = "training_daily_summary_v2"
PAGE_SIZE = 1_000
MIN_TRUSTED_HOURS = 18
ALLOWED_SOURCES_DEFAULT = ("open-meteo",)
PROVINCE_IDS = (
    "TH-30", "TH-31", "TH-32", "TH-33", "TH-34",
    "TH-35", "TH-36", "TH-37", "TH-38", "TH-39",
    "TH-40", "TH-41", "TH-42", "TH-43", "TH-44",
    "TH-45", "TH-46", "TH-47", "TH-48", "TH-49",
)


@dataclass
class ChronologicalSplit:
    X_train: np.ndarray
    y_reg_train: np.ndarray
    y_cls_train: np.ndarray
    X_validation: np.ndarray
    y_reg_validation: np.ndarray
    y_cls_validation: np.ndarray
    X_test: np.ndarray
    y_reg_test: np.ndarray
    y_cls_test: np.ndarray
    train_rows: pd.DataFrame
    validation_rows: pd.DataFrame
    test_rows: pd.DataFrame


@dataclass
class TaskSelection:
    family: str
    model: object
    validation_metrics: dict
    test_metrics: dict
    baseline_metrics: dict
    eligible: bool
    eligibility_reasons: list[str]
    warnings: list[str]
    runtime_artifact: dict
    runtime_metrics: dict
    teacher_validation_metrics: dict = field(default_factory=dict)
    teacher_test_metrics: dict = field(default_factory=dict)
    candidate_validation_metrics: dict = field(default_factory=dict)
    tuning: dict = field(default_factory=dict)


@dataclass
class ProvinceResult:
    province_id: str
    run_id: str
    regression: TaskSelection
    classification: TaskSelection
    audit: dict
    registry_rows: list[dict]
    error: str | None = None


def _git_sha() -> str | None:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        return None


def _library_versions() -> dict[str, str]:
    packages = (
        "numpy", "pandas", "scikit-learn", "lightgbm", "joblib", "supabase",
    )
    result: dict[str, str] = {}
    for package in packages:
        try:
            result[package] = importlib.metadata.version(package)
        except importlib.metadata.PackageNotFoundError:
            result[package] = "unknown"
    return result


def _json_safe(value):
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    if isinstance(value, np.ndarray):
        return [_json_safe(item) for item in value.tolist()]
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        return float(value)
    if isinstance(value, (datetime, pd.Timestamp)):
        return value.isoformat()
    return value


def _sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _sha256_json(value: object) -> str:
    payload = json.dumps(
        _json_safe(value),
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return _sha256_bytes(payload)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--register", action="store_true", help="register inactive candidates")
    parser.add_argument("--activate", action="store_true", help="activate eligible task candidates")
    parser.add_argument("--dry-run", action="store_true", help="train and validate without DB writes")
    parser.add_argument("--province", action="append", choices=PROVINCE_IDS)
    parser.add_argument("--min-rows", type=int, default=180)
    parser.add_argument("--cv-splits", type=int, default=5)
    parser.add_argument("--artifact-dir", type=Path, default=Path("training/artifacts"))
    parser.add_argument("--allowed-source", action="append")
    parser.add_argument(
        "--model-family",
        action="append",
        choices=MODEL_FAMILIES,
        help="model family to evaluate; repeat to select a subset",
    )
    parser.add_argument(
        "--serving-policy",
        choices=(
            "direct_classifier",
            "regression_threshold",
            "classifier_with_regression_fallback",
        ),
        default="classifier_with_regression_fallback",
    )
    args = parser.parse_args()
    if args.activate and (not args.register or args.dry_run):
        parser.error("--activate requires --register and cannot be combined with --dry-run")
    return args


def get_client() -> Client:
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
    return create_client(url, key)


def fetch_observed_rows(sb: Client, province_ids: tuple[str, ...]) -> pd.DataFrame:
    columns = [
        "province_id", "date", "trusted_hours", "trusted_sources",
        *SOURCE_FEATURE_COLUMNS,
    ]
    rows: list[dict] = []
    start = 0
    while True:
        response = (
            sb.table(OBSERVED_VIEW)
            .select(",".join(columns))
            .in_("province_id", list(province_ids))
            .order("province_id")
            .order("date")
            .range(start, start + PAGE_SIZE - 1)
            .execute()
        )
        page = response.data or []
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            break
        start += PAGE_SIZE
    if not rows:
        raise RuntimeError(f"{OBSERVED_VIEW} returned no usable rows")
    frame = pd.DataFrame(rows)
    frame["date"] = pd.to_datetime(frame["date"], errors="raise")
    for column in (*SOURCE_FEATURE_COLUMNS, "trusted_hours"):
        frame[column] = pd.to_numeric(frame[column], errors="coerce")
    frame = frame.sort_values(["province_id", "date"]).reset_index(drop=True)
    frame["pm25_lag_6d"] = (
        frame.groupby("province_id", sort=False)["pm25_mean"].shift(6)
    )
    day_of_year = frame["date"].dt.dayofyear.to_numpy(dtype=float)
    frame["day_of_year_sin"] = np.sin(2.0 * np.pi * day_of_year / 365.25)
    frame["day_of_year_cos"] = np.cos(2.0 * np.pi * day_of_year / 365.25)
    return frame


def filter_training_rows(frame: pd.DataFrame, allowed_sources: set[str]) -> pd.DataFrame:
    def accepted(value: object) -> bool:
        values = value if isinstance(value, list) else []
        return bool({str(item).lower() for item in values} & allowed_sources)

    return frame[
        (frame["trusted_hours"] >= MIN_TRUSTED_HOURS)
        & frame["trusted_sources"].map(accepted)
    ].copy()


def prepare_targets(frame: pd.DataFrame) -> pd.DataFrame:
    """Build strict t -> t+1 targets without using predicted regression values."""
    clean = frame.sort_values("date").drop_duplicates("date", keep="last").copy()
    clean["target_pm25_next_day"] = clean["pm25_mean"].shift(-1)
    clean["target_date"] = clean["date"].shift(-1)
    clean = clean[clean["target_date"] == clean["date"] + pd.Timedelta(days=1)]
    clean = clean.dropna(subset=[*FEATURE_COLUMNS, "target_pm25_next_day"]).copy()
    clean["target_air_quality_class"] = classes_for_pm25(
        clean["target_pm25_next_day"].to_numpy(dtype=float)
    )
    return clean


def chronological_split(frame: pd.DataFrame, config: PipelineConfig) -> ChronologicalSplit:
    if len(frame) < config.minimum_rows:
        raise ValueError(f"insufficient rows: {len(frame)} < {config.minimum_rows}")
    test_size = max(config.minimum_test_rows, round(len(frame) * config.test_fraction))
    validation_size = max(
        config.minimum_validation_rows,
        round(len(frame) * config.validation_fraction),
    )
    train_size = len(frame) - validation_size - test_size
    if train_size < 90:
        raise ValueError("chronological training split has fewer than 90 rows")

    train_rows = frame.iloc[:train_size].copy()
    validation_rows = frame.iloc[train_size:train_size + validation_size].copy()
    test_rows = frame.iloc[train_size + validation_size:].copy()

    def xy(rows: pd.DataFrame) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        return (
            rows.loc[:, FEATURE_COLUMNS].to_numpy(dtype=float),
            rows["target_pm25_next_day"].to_numpy(dtype=float),
            rows["target_air_quality_class"].to_numpy(dtype=np.int64),
        )

    X_train, y_reg_train, y_cls_train = xy(train_rows)
    X_validation, y_reg_validation, y_cls_validation = xy(validation_rows)
    X_test, y_reg_test, y_cls_test = xy(test_rows)
    return ChronologicalSplit(
        X_train, y_reg_train, y_cls_train,
        X_validation, y_reg_validation, y_cls_validation,
        X_test, y_reg_test, y_cls_test,
        train_rows, validation_rows, test_rows,
    )


def expanding_window_indices(
    row_count: int,
    splits: int,
    *,
    minimum_train_rows: int = 90,
) -> list[tuple[np.ndarray, np.ndarray]]:
    """Build deterministic expanding folds inside the development period."""
    available = row_count - minimum_train_rows
    if available < splits:
        raise ValueError(
            "insufficient development rows for expanding-window validation"
        )
    fold_size = max(1, available // splits)
    first_validation_start = row_count - fold_size * splits
    if first_validation_start < minimum_train_rows:
        raise ValueError("expanding-window initial training period is too short")
    folds: list[tuple[np.ndarray, np.ndarray]] = []
    for fold_index in range(splits):
        validation_start = first_validation_start + fold_index * fold_size
        validation_end = (
            row_count
            if fold_index == splits - 1
            else validation_start + fold_size
        )
        folds.append((
            np.arange(0, validation_start, dtype=np.int64),
            np.arange(validation_start, validation_end, dtype=np.int64),
        ))
    return folds


def _mean_numeric_metrics(rows: list[dict]) -> dict[str, float]:
    keys = sorted({
        key
        for row in rows
        for key, value in row.items()
        if isinstance(value, (int, float)) and value is not None
    })
    return {
        key: float(np.mean([row[key] for row in rows if row.get(key) is not None]))
        for key in keys
    }


def evaluate_sarimax_baseline(split: ChronologicalSplit) -> dict:
    """Evaluate a weekly SARIMAX research baseline on the final holdout."""
    try:
        from statsmodels.tsa.statespace.sarimax import SARIMAX
    except ImportError:
        return {
            "status": "unavailable",
            "reason": "statsmodels_not_installed",
        }
    development = np.concatenate([
        split.y_reg_train,
        split.y_reg_validation,
    ])
    try:
        fitted = SARIMAX(
            development,
            order=(1, 0, 1),
            seasonal_order=(1, 0, 1, 7),
            enforce_stationarity=False,
            enforce_invertibility=False,
        ).fit(disp=False, maxiter=200)
        predictions = np.asarray(
            fitted.forecast(steps=len(split.y_reg_test)),
            dtype=float,
        )
        return {
            "status": "evaluated",
            "order": [1, 0, 1],
            "seasonal_order": [1, 0, 1, 7],
            **regression_metrics(split.y_reg_test, predictions),
        }
    except Exception as exc:
        return {
            "status": "failed",
            "reason": f"{type(exc).__name__}: {exc}",
        }


def regression_factories(seed: int) -> dict[str, Callable[[], object]]:
    return {
        "random_forest": lambda: RandomForestRegressor(
            n_estimators=300, min_samples_leaf=3, random_state=seed, n_jobs=-1
        ),
        "lightgbm": lambda: lgb.LGBMRegressor(
            n_estimators=300, max_depth=4, learning_rate=0.04,
            subsample=0.8, colsample_bytree=0.8, min_child_samples=10,
            random_state=seed, n_jobs=-1, verbose=-1,
        ),
    }


def classification_factories(seed: int) -> dict[str, Callable[[], object]]:
    return {
        "random_forest": lambda: RandomForestClassifier(
            n_estimators=300, min_samples_leaf=3, class_weight="balanced",
            random_state=seed, n_jobs=-1,
        ),
        "lightgbm": lambda: lgb.LGBMClassifier(
            n_estimators=300, max_depth=4, learning_rate=0.04,
            subsample=0.8, colsample_bytree=0.8, min_child_samples=10,
            class_weight="balanced", random_state=seed, n_jobs=-1, verbose=-1,
        ),
    }


def regression_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    nonzero = np.abs(y_true) > 1e-9
    mape = float(np.mean(np.abs((y_true[nonzero] - y_pred[nonzero]) / y_true[nonzero])) * 100) if np.any(nonzero) else None
    denominator = np.abs(y_true) + np.abs(y_pred)
    valid_smape = denominator > 1e-9
    smape = float(np.mean(2 * np.abs(y_pred[valid_smape] - y_true[valid_smape]) / denominator[valid_smape]) * 100) if np.any(valid_smape) else None
    return {
        "mae": float(mean_absolute_error(y_true, y_pred)),
        "rmse": float(np.sqrt(mean_squared_error(y_true, y_pred))),
        "r2": float(r2_score(y_true, y_pred)),
        "mape": mape,
        "smape": smape,
        "bias": float(np.mean(y_pred - y_true)),
        "test_rows": int(len(y_true)),
    }


def _aligned_probabilities(model: object, X: np.ndarray) -> np.ndarray:
    raw = np.asarray(model.predict_proba(X), dtype=float)
    classes = [int(value) for value in np.asarray(model.classes_).tolist()]
    aligned = np.zeros((len(X), len(CLASS_IDS)), dtype=float)
    for source_index, class_id in enumerate(classes):
        if class_id in CLASS_IDS:
            aligned[:, class_id - 1] = raw[:, source_index]
    for row_index in range(len(aligned)):
        aligned[row_index] = normalize_probabilities(aligned[row_index])
    return aligned


def classification_metrics(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    probabilities: np.ndarray | None,
) -> dict:
    def wilson_interval(successes: float, total: int) -> list[float] | None:
        if total <= 0:
            return None
        z = 1.959963984540054
        proportion = successes / total
        denominator = 1.0 + z * z / total
        center = (proportion + z * z / (2.0 * total)) / denominator
        margin = (
            z
            * math.sqrt(
                proportion * (1.0 - proportion) / total
                + z * z / (4.0 * total * total)
            )
            / denominator
        )
        return [max(0.0, center - margin), min(1.0, center + margin)]

    precision, recall, f1, support = precision_recall_fscore_support(
        y_true, y_pred, labels=CLASS_IDS, zero_division=0
    )
    macro = precision_recall_fscore_support(
        y_true,
        y_pred,
        labels=CLASS_IDS,
        average="macro",
        zero_division=0,
    )
    observed_macro = precision_recall_fscore_support(
        y_true, y_pred, average="macro", zero_division=0
    )
    weighted = precision_recall_fscore_support(
        y_true, y_pred, average="weighted", zero_division=0
    )
    result = {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        # Fixed-five balanced accuracy is the mean recall over the complete
        # public class contract. Absent classes therefore contribute zero
        # instead of silently disappearing from the score.
        "balanced_accuracy": float(macro[1]),
        "observed_balanced_accuracy": float(observed_macro[1]),
        "macro_precision": float(macro[0]),
        "macro_recall": float(macro[1]),
        "macro_f1": float(macro[2]),
        "observed_macro_precision": float(observed_macro[0]),
        "observed_macro_recall": float(observed_macro[1]),
        "observed_macro_f1": float(observed_macro[2]),
        "metric_class_contract": [int(value) for value in CLASS_IDS],
        "weighted_precision": float(weighted[0]),
        "weighted_recall": float(weighted[1]),
        "weighted_f1": float(weighted[2]),
        "per_class": {
            str(class_id): {
                "precision": float(precision[index]),
                "recall": float(recall[index]),
                "f1": float(f1[index]),
                "support": int(support[index]),
                "recall_ci95": wilson_interval(
                    float(recall[index]) * int(support[index]),
                    int(support[index]),
                ),
            }
            for index, class_id in enumerate(CLASS_IDS)
        },
        "confusion_matrix": confusion_matrix(
            y_true, y_pred, labels=CLASS_IDS
        ).astype(int).tolist(),
        "test_rows": int(len(y_true)),
        "accuracy_ci95": wilson_interval(
            float(np.sum(np.asarray(y_true) == np.asarray(y_pred))),
            int(len(y_true)),
        ),
    }
    result["log_loss"] = (
        float(log_loss(y_true, probabilities, labels=CLASS_IDS))
        if probabilities is not None else None
    )
    if probabilities is not None:
        one_hot = np.zeros_like(probabilities, dtype=float)
        one_hot[np.arange(len(y_true)), np.asarray(y_true, dtype=int) - 1] = 1.0
        result["brier_score"] = float(
            np.mean(np.sum((probabilities - one_hot) ** 2, axis=1))
        )
        confidence = np.max(probabilities, axis=1)
        predicted = np.asarray(CLASS_IDS)[np.argmax(probabilities, axis=1)]
        correct = (predicted == y_true).astype(float)
        ece = 0.0
        for lower in np.linspace(0.0, 0.9, 10):
            upper = lower + 0.1
            in_bin = (confidence >= lower) & (
                confidence <= upper if upper >= 1.0 else confidence < upper
            )
            if np.any(in_bin):
                ece += (
                    float(np.mean(in_bin))
                    * abs(
                        float(np.mean(correct[in_bin]))
                        - float(np.mean(confidence[in_bin]))
                    )
                )
        result["expected_calibration_error"] = float(ece)
        per_class_pr_auc: dict[str, float | None] = {}
        for class_id in CLASS_IDS:
            binary_truth = (np.asarray(y_true) == class_id).astype(int)
            per_class_pr_auc[str(class_id)] = (
                float(
                    average_precision_score(
                        binary_truth,
                        probabilities[:, class_id - 1],
                    )
                )
                if np.any(binary_truth)
                else None
            )
        supported_pr_auc = [
            value
            for value in per_class_pr_auc.values()
            if value is not None
        ]
        result["per_class_pr_auc"] = per_class_pr_auc
        result["macro_pr_auc_supported"] = (
            float(np.mean(supported_pr_auc))
            if supported_pr_auc else None
        )
    else:
        result["brier_score"] = None
        result["expected_calibration_error"] = None
        result["per_class_pr_auc"] = {
            str(class_id): None for class_id in CLASS_IDS
        }
        result["macro_pr_auc_supported"] = None
    return result


def _fit_classifier(model: object, X: np.ndarray, y: np.ndarray) -> object:
    weights = compute_sample_weight(class_weight="balanced", y=y)
    try:
        return model.fit(X, y, sample_weight=weights)
    except TypeError:
        return model.fit(X, y)


def _regression_baseline(X: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, dict]:
    current_index = FEATURE_COLUMNS.index("pm25_mean")
    predictions = X[:, current_index]
    return predictions, regression_metrics(y, predictions)


def _seasonal_naive_regression_baseline(
    X: np.ndarray,
    y: np.ndarray,
) -> tuple[np.ndarray, dict]:
    """Seven-day seasonal-naive baseline for the next-day target."""
    seasonal_index = FEATURE_COLUMNS.index("pm25_lag_6d")
    predictions = X[:, seasonal_index]
    return predictions, regression_metrics(y, predictions)


def _classification_baseline(X: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, dict]:
    current_index = FEATURE_COLUMNS.index("pm25_mean")
    predictions = classes_for_pm25(X[:, current_index])
    probabilities = np.zeros((len(y), len(CLASS_IDS)), dtype=float)
    probabilities[np.arange(len(y)), predictions - 1] = 1.0
    return predictions, classification_metrics(y, predictions, probabilities)


def _evaluate_portable_regression(X: np.ndarray, artifact: dict) -> np.ndarray:
    coefficients = np.asarray(artifact["coefficients"], dtype=float)
    means = np.asarray(artifact["scaler_mean"], dtype=float)
    scales = np.asarray(artifact["scaler_scale"], dtype=float)
    safe_scales = np.where(np.abs(scales) > 1e-12, scales, 1.0)
    surrogate = (
        ((X - means) / safe_scales) @ coefficients
        + float(artifact["intercept"])
    )
    persistence = X[:, FEATURE_COLUMNS.index("pm25_mean")]
    model_weight = float(artifact.get("model_weight", 1.0))
    return model_weight * surrogate + (1.0 - model_weight) * persistence


def _fit_portable_regression(
    model: object,
    X_fit: np.ndarray,
    X_evaluate: np.ndarray,
    y_evaluate: np.ndarray,
    *,
    alpha: float,
    model_weight: float,
) -> tuple[dict, dict]:
    """Distil a teacher and retain persistence as a strong one-day anchor."""
    scaler = StandardScaler().fit(X_fit)
    teacher_fit = np.asarray(model.predict(X_fit), dtype=float)
    surrogate = Ridge(alpha=alpha).fit(scaler.transform(X_fit), teacher_fit)
    artifact = {
        "artifact_schema": "standardized-ridge-blend-v2",
        "feature_cols": list(FEATURE_COLUMNS),
        "coefficients": surrogate.coef_.astype(float).tolist(),
        "intercept": float(surrogate.intercept_),
        "scaler_mean": scaler.mean_.astype(float).tolist(),
        "scaler_scale": scaler.scale_.astype(float).tolist(),
        "alpha": float(alpha),
        "model_weight": float(model_weight),
        "persistence_feature": "pm25_mean",
    }
    predictions = _evaluate_portable_regression(X_evaluate, artifact)
    return artifact, regression_metrics(y_evaluate, predictions)


def _powered_sample_weights(y: np.ndarray, power: float) -> np.ndarray:
    """Interpolate between unweighted and fully balanced class weights."""
    values, counts = np.unique(y, return_counts=True)
    total = float(len(y))
    classes = float(len(values))
    by_class = {
        int(value): (total / (classes * float(count))) ** power
        for value, count in zip(values, counts, strict=True)
    }
    weights = np.asarray([by_class[int(value)] for value in y], dtype=float)
    return weights / max(float(np.mean(weights)), 1e-12)


def _blend_classifier_probabilities(
    probabilities: np.ndarray,
    X: np.ndarray,
    model_weight: float,
) -> np.ndarray:
    """Anchor a portable classifier to the strong current-day class baseline."""
    if not 0 < model_weight <= 1:
        raise ValueError("classifier model weight must be within (0, 1]")
    if model_weight == 1.0:
        return probabilities
    current_index = FEATURE_COLUMNS.index("pm25_mean")
    persistence_classes = classes_for_pm25(X[:, current_index])
    persistence = np.zeros_like(probabilities)
    persistence[np.arange(len(X)), persistence_classes - 1] = 1.0
    return model_weight * probabilities + (1.0 - model_weight) * persistence


def _temperature_scale_probabilities(
    probabilities: np.ndarray,
    temperature: float,
) -> np.ndarray:
    if temperature <= 0:
        raise ValueError("classifier temperature must be positive")
    if temperature == 1.0:
        return probabilities
    powered = np.power(np.clip(probabilities, 1e-12, 1.0), 1.0 / temperature)
    return powered / powered.sum(axis=1, keepdims=True)


def _fit_portable_classifier(
    X_fit: np.ndarray,
    y_fit: np.ndarray,
    X_evaluate: np.ndarray,
    y_evaluate: np.ndarray,
    *,
    seed: int,
    regularization_c: float,
    weight_power: float,
    model_weight: float,
    temperature: float,
) -> tuple[dict, dict, object, StandardScaler]:
    scaler = StandardScaler().fit(X_fit)
    model = LogisticRegression(
        C=regularization_c,
        max_iter=2_000,
        random_state=seed,
    ).fit(
        scaler.transform(X_fit),
        y_fit,
        sample_weight=_powered_sample_weights(y_fit, weight_power),
    )
    probabilities = _blend_classifier_probabilities(
        _temperature_scale_probabilities(
            _aligned_probabilities(model, scaler.transform(X_evaluate)),
            temperature,
        ),
        X_evaluate,
        model_weight,
    )
    predictions = np.asarray(CLASS_IDS)[np.argmax(probabilities, axis=1)]
    artifact = {
        "artifact_schema": "standardized-logistic-persistence-blend-v3",
        "feature_cols": list(FEATURE_COLUMNS),
        "classes": [int(value) for value in model.classes_],
        "coefficients": np.asarray(model.coef_, dtype=float).tolist(),
        "intercepts": np.asarray(model.intercept_, dtype=float).tolist(),
        "scaler_mean": scaler.mean_.astype(float).tolist(),
        "scaler_scale": scaler.scale_.astype(float).tolist(),
        "threshold_version": THRESHOLD_VERSION,
        "regularization_c": float(regularization_c),
        "weight_power": float(weight_power),
        "model_weight": float(model_weight),
        "temperature": float(temperature),
        "persistence_feature": "pm25_mean",
    }
    return (
        artifact,
        classification_metrics(y_evaluate, predictions, probabilities),
        model,
        scaler,
    )


def _regression_eligibility(
    metrics: dict,
    baseline: dict,
    validation: dict,
    config: PipelineConfig,
) -> tuple[bool, list[str]]:
    reasons: list[str] = []
    if metrics["test_rows"] < config.minimum_test_rows:
        reasons.append("insufficient_test_rows")
    skill = 1.0 - metrics["mae"] / baseline["mae"] if baseline["mae"] > 0 else 0.0
    if skill < config.regression_minimum_skill or metrics["mae"] >= baseline["mae"]:
        reasons.append("skill_below_threshold")
    gap = abs(metrics["mae"] - validation["mae"]) / max(validation["mae"], 1e-9)
    if gap > 1.0:
        reasons.append("severe_overfitting")
    return not reasons, reasons or ["eligible"]


def _classification_eligibility(
    train_metrics: dict,
    metrics: dict,
    baseline: dict,
    probabilities: np.ndarray,
    config: PipelineConfig,
) -> tuple[bool, list[str], list[str]]:
    reasons: list[str] = []
    warnings: list[str] = []
    if metrics["test_rows"] < config.minimum_test_rows:
        reasons.append("insufficient_test_rows")
    if (
        metrics["macro_f1"] <= baseline["macro_f1"]
        or metrics["macro_f1"] < config.classifier_minimum_macro_f1
    ):
        reasons.append("macro_f1_below_baseline")
    if metrics["balanced_accuracy"] <= baseline["balanced_accuracy"]:
        reasons.append("balanced_accuracy_below_baseline")
    if metrics["weighted_f1"] <= baseline["weighted_f1"]:
        reasons.append("weighted_f1_below_baseline")
    for class_id in (4, 5):
        per_class = metrics["per_class"][str(class_id)]
        if per_class["support"] < config.critical_class_minimum_support:
            reason = f"insufficient_evidence_class:{class_id}"
            reasons.append(reason)
            warnings.append(f"missing_critical_class_support:{class_id}")
        elif per_class["recall"] < config.classifier_minimum_critical_recall:
            reasons.append(f"critical_class_recall_too_low:{class_id}")
    if train_metrics["macro_f1"] - metrics["macro_f1"] > config.maximum_train_test_gap:
        reasons.append("severe_overfitting")
    if (
        probabilities.shape != (metrics["test_rows"], len(CLASS_IDS))
        or not np.all(np.isfinite(probabilities))
        or np.any(probabilities < 0)
        or not np.allclose(probabilities.sum(axis=1), 1.0, atol=1e-6)
    ):
        reasons.append("invalid_probabilities")
    return not reasons, reasons or ["eligible"], warnings


def select_regression(split: ChronologicalSplit, config: PipelineConfig) -> TaskSelection:
    _, validation_baseline = _regression_baseline(
        split.X_validation, split.y_reg_validation
    )
    teacher_validation: dict[str, dict] = {}
    runtime_validation: dict[str, dict] = {}
    runtime_tuning: dict[str, dict] = {}
    candidate_metrics: dict[str, dict] = {}
    fitted: dict[str, object] = {}
    factories = regression_factories(config.random_seed)
    for family in config.allowed_model_families:
        factory = factories[family]
        model = factory().fit(split.X_train, split.y_reg_train)
        fitted[family] = model
        teacher_validation[family] = regression_metrics(
            split.y_reg_validation, model.predict(split.X_validation)
        )
        teacher_validation[family]["skill_vs_persistence"] = (
            1.0 - teacher_validation[family]["mae"] / validation_baseline["mae"]
            if validation_baseline["mae"] > 0 else 0.0
        )

        best_metrics: dict | None = None
        best_tuning: dict | None = None
        for alpha in config.regression_surrogate_alphas:
            for model_weight in config.regression_blend_weights:
                _, metrics = _fit_portable_regression(
                    model,
                    split.X_train,
                    split.X_validation,
                    split.y_reg_validation,
                    alpha=alpha,
                    model_weight=model_weight,
                )
                metrics["skill_vs_persistence"] = (
                    1.0 - metrics["mae"] / validation_baseline["mae"]
                    if validation_baseline["mae"] > 0 else 0.0
                )
                if best_metrics is None or (
                    metrics["skill_vs_persistence"],
                    -metrics["mae"],
                    -metrics["rmse"],
                ) > (
                    best_metrics["skill_vs_persistence"],
                    -best_metrics["mae"],
                    -best_metrics["rmse"],
                ):
                    best_metrics = metrics
                    best_tuning = {
                        "alpha": float(alpha),
                        "model_weight": float(model_weight),
                    }
        if best_metrics is None or best_tuning is None:
            raise RuntimeError(f"no portable regression candidate for {family}")
        runtime_validation[family] = best_metrics
        runtime_tuning[family] = best_tuning
        candidate_metrics[family] = {
            "teacher": teacher_validation[family],
            "production_surrogate": best_metrics,
            "tuning": best_tuning,
        }

    family = max(
        runtime_validation,
        key=lambda item: (
            runtime_validation[item]["skill_vs_persistence"],
            -runtime_validation[item]["mae"],
            -runtime_validation[item]["rmse"],
            teacher_validation[item]["skill_vs_persistence"],
        ),
    )
    calibration_artifact, _ = _fit_portable_regression(
        fitted[family],
        split.X_train,
        split.X_validation,
        split.y_reg_validation,
        alpha=runtime_tuning[family]["alpha"],
        model_weight=runtime_tuning[family]["model_weight"],
    )
    calibration_predictions = _evaluate_portable_regression(
        split.X_validation,
        calibration_artifact,
    )
    calibration_residuals = split.y_reg_validation - calibration_predictions
    residual_quantiles = {
        name: float(value)
        for name, value in zip(
            ("p10", "p50", "p90"),
            np.quantile(calibration_residuals, (0.10, 0.50, 0.90)),
            strict=True,
        )
    }
    X_fit = np.vstack([split.X_train, split.X_validation])
    y_fit = np.concatenate([split.y_reg_train, split.y_reg_validation])
    model = clone(fitted[family]).fit(X_fit, y_fit)
    teacher_test_metrics = regression_metrics(
        split.y_reg_test,
        np.asarray(model.predict(split.X_test), dtype=float),
    )
    _, baseline_metrics = _regression_baseline(split.X_test, split.y_reg_test)
    _, seasonal_baseline_metrics = _seasonal_naive_regression_baseline(
        split.X_test,
        split.y_reg_test,
    )
    baseline_metrics["seasonal_naive"] = seasonal_baseline_metrics
    teacher_test_metrics["skill_vs_persistence"] = (
        1.0 - teacher_test_metrics["mae"] / baseline_metrics["mae"]
        if baseline_metrics["mae"] > 0 else 0.0
    )
    tuning = runtime_tuning[family]
    runtime_artifact, runtime_metrics = _fit_portable_regression(
        model,
        X_fit,
        split.X_test,
        split.y_reg_test,
        alpha=tuning["alpha"],
        model_weight=tuning["model_weight"],
    )
    runtime_metrics["skill_vs_persistence"] = (
        1.0 - runtime_metrics["mae"] / baseline_metrics["mae"]
        if baseline_metrics["mae"] > 0 else 0.0
    )
    runtime_metrics["skill_vs_seasonal_naive"] = (
        1.0
        - runtime_metrics["mae"] / seasonal_baseline_metrics["mae"]
        if seasonal_baseline_metrics["mae"] > 0 else 0.0
    )
    runtime_artifact["residual_quantiles"] = residual_quantiles
    runtime_artifact["calibration_rows"] = int(len(calibration_residuals))
    runtime_artifact["calibration_method"] = "chronological_holdout_residual"
    eligible, reasons = _regression_eligibility(
        runtime_metrics,
        baseline_metrics,
        runtime_validation[family],
        config,
    )
    return TaskSelection(
        family=family,
        model=model,
        validation_metrics=runtime_validation[family],
        test_metrics=runtime_metrics,
        baseline_metrics=baseline_metrics,
        eligible=eligible,
        eligibility_reasons=reasons,
        warnings=[],
        runtime_artifact=runtime_artifact,
        runtime_metrics=runtime_metrics,
        teacher_validation_metrics=teacher_validation[family],
        teacher_test_metrics=teacher_test_metrics,
        candidate_validation_metrics=candidate_metrics,
        tuning=tuning,
    )


def select_classification(split: ChronologicalSplit, config: PipelineConfig) -> TaskSelection:
    _, validation_baseline = _classification_baseline(
        split.X_validation, split.y_cls_validation
    )
    teacher_validation: dict[str, dict] = {}
    fitted: dict[str, object] = {}
    factories = classification_factories(config.random_seed)
    for family in config.allowed_model_families:
        factory = factories[family]
        model = _fit_classifier(factory(), split.X_train, split.y_cls_train)
        fitted[family] = model
        probabilities = _aligned_probabilities(model, split.X_validation)
        predictions = np.asarray(CLASS_IDS)[np.argmax(probabilities, axis=1)]
        teacher_validation[family] = classification_metrics(
            split.y_cls_validation, predictions, probabilities
        )
    family = max(
        teacher_validation,
        key=lambda item: (
            teacher_validation[item]["macro_f1"],
            teacher_validation[item]["per_class"]["5"]["recall"],
            teacher_validation[item]["per_class"]["4"]["recall"],
            teacher_validation[item]["balanced_accuracy"],
        ),
    )

    portable_validation: dict[str, dict] = {}
    best_portable_metrics: dict | None = None
    best_tuning: dict | None = None
    for regularization_c in config.classifier_regularization_c:
        for weight_power in config.classifier_weight_powers:
            for model_weight in config.classifier_blend_weights:
                for temperature in config.classifier_temperatures:
                    _, metrics, portable_model, portable_scaler = _fit_portable_classifier(
                        split.X_train,
                        split.y_cls_train,
                        split.X_validation,
                        split.y_cls_validation,
                        seed=config.random_seed,
                        regularization_c=regularization_c,
                        weight_power=weight_power,
                        model_weight=model_weight,
                        temperature=temperature,
                    )
                    train_probabilities = _blend_classifier_probabilities(
                        _temperature_scale_probabilities(
                            _aligned_probabilities(
                                portable_model,
                                portable_scaler.transform(split.X_train),
                            ),
                            temperature,
                        ),
                        split.X_train,
                        model_weight,
                    )
                    train_predictions = np.asarray(CLASS_IDS)[
                        np.argmax(train_probabilities, axis=1)
                    ]
                    train_metrics = classification_metrics(
                        split.y_cls_train,
                        train_predictions,
                        train_probabilities,
                    )
                    generalization_gap = (
                        train_metrics["macro_f1"] - metrics["macro_f1"]
                    )
                    key = (
                        f"C={regularization_c:g},weight_power={weight_power:g},"
                        f"model_weight={model_weight:g},temperature={temperature:g}"
                    )
                    portable_validation[key] = {
                        "train": train_metrics,
                        "validation": metrics,
                        "macro_f1_gap": generalization_gap,
                    }
                    supported_critical_recall = [
                        metrics["per_class"][str(class_id)]["recall"]
                        for class_id in (4, 5)
                        if metrics["per_class"][str(class_id)]["support"]
                        >= config.critical_class_minimum_support
                    ]
                    critical_recall = (
                        min(supported_critical_recall)
                        if len(supported_critical_recall) == 2 else 0.0
                    )
                    if best_portable_metrics is None:
                        is_better = True
                    else:
                        best_supported_critical_recall = [
                            best_portable_metrics["per_class"][str(class_id)]["recall"]
                            for class_id in (4, 5)
                            if best_portable_metrics["per_class"][str(class_id)]["support"]
                            >= config.critical_class_minimum_support
                        ]
                        best_critical_recall = (
                            min(best_supported_critical_recall)
                            if len(best_supported_critical_recall) == 2 else 0.0
                        )
                        is_better = (
                            generalization_gap <= config.maximum_train_test_gap,
                            metrics["macro_f1"],
                            critical_recall,
                            metrics["balanced_accuracy"],
                            metrics["weighted_f1"],
                            -float(metrics["log_loss"] or 1e9),
                            -float(metrics["expected_calibration_error"] or 1e9),
                        ) > (
                            best_tuning["validation_gap"] <= config.maximum_train_test_gap,
                            best_portable_metrics["macro_f1"],
                            best_critical_recall,
                            best_portable_metrics["balanced_accuracy"],
                            best_portable_metrics["weighted_f1"],
                            -float(best_portable_metrics["log_loss"] or 1e9),
                            -float(
                                best_portable_metrics[
                                    "expected_calibration_error"
                                ] or 1e9
                            ),
                        )
                    if is_better:
                        best_portable_metrics = metrics
                        best_tuning = {
                            "regularization_c": float(regularization_c),
                            "weight_power": float(weight_power),
                            "model_weight": float(model_weight),
                            "temperature": float(temperature),
                            "validation_gap": float(generalization_gap),
                        }
    if best_portable_metrics is None or best_tuning is None:
        raise RuntimeError("no portable classification candidate")

    X_fit = np.vstack([split.X_train, split.X_validation])
    y_fit = np.concatenate([split.y_cls_train, split.y_cls_validation])
    model = _fit_classifier(clone(fitted[family]), X_fit, y_fit)
    teacher_probabilities = _aligned_probabilities(model, split.X_test)
    teacher_predictions = np.asarray(CLASS_IDS)[
        np.argmax(teacher_probabilities, axis=1)
    ]
    teacher_test_metrics = classification_metrics(
        split.y_cls_test,
        teacher_predictions,
        teacher_probabilities,
    )
    _, baseline_metrics = _classification_baseline(split.X_test, split.y_cls_test)
    runtime_artifact, runtime_metrics, runtime_model, runtime_scaler = (
        _fit_portable_classifier(
            X_fit,
            y_fit,
            split.X_test,
            split.y_cls_test,
            seed=config.random_seed,
            regularization_c=best_tuning["regularization_c"],
            weight_power=best_tuning["weight_power"],
            model_weight=best_tuning["model_weight"],
            temperature=best_tuning["temperature"],
        )
    )
    runtime_train_probabilities = _blend_classifier_probabilities(
        _temperature_scale_probabilities(
            _aligned_probabilities(
                runtime_model,
                runtime_scaler.transform(X_fit),
            ),
            best_tuning["temperature"],
        ),
        X_fit,
        best_tuning["model_weight"],
    )
    runtime_train_predictions = np.asarray(CLASS_IDS)[
        np.argmax(runtime_train_probabilities, axis=1)
    ]
    runtime_train_metrics = classification_metrics(
        y_fit,
        runtime_train_predictions,
        runtime_train_probabilities,
    )
    runtime_probabilities = _blend_classifier_probabilities(
        _temperature_scale_probabilities(
            _aligned_probabilities(
                runtime_model,
                runtime_scaler.transform(split.X_test),
            ),
            best_tuning["temperature"],
        ),
        split.X_test,
        best_tuning["model_weight"],
    )
    eligible, reasons, warnings = _classification_eligibility(
        runtime_train_metrics,
        runtime_metrics,
        baseline_metrics,
        runtime_probabilities,
        config,
    )
    return TaskSelection(
        family=family,
        model=model,
        validation_metrics=best_portable_metrics,
        test_metrics=runtime_metrics,
        baseline_metrics=baseline_metrics,
        eligible=eligible,
        eligibility_reasons=reasons,
        warnings=warnings,
        runtime_artifact=runtime_artifact,
        runtime_metrics=runtime_metrics,
        teacher_validation_metrics=teacher_validation[family],
        teacher_test_metrics=teacher_test_metrics,
        candidate_validation_metrics={
            "teachers": teacher_validation,
            "production_classifier": portable_validation,
        },
        tuning=best_tuning,
    )


def apply_expanding_window_validation(
    split: ChronologicalSplit,
    regression: TaskSelection,
    classification: TaskSelection,
    config: PipelineConfig,
) -> dict:
    """Validate the selected serving artifacts across expanding time folds.

    The final test split is deliberately excluded. Fold metrics are recorded
    and act as an additional promotion gate.
    """
    X_development = np.vstack([split.X_train, split.X_validation])
    y_reg_development = np.concatenate([
        split.y_reg_train,
        split.y_reg_validation,
    ])
    y_cls_development = np.concatenate([
        split.y_cls_train,
        split.y_cls_validation,
    ])
    folds = expanding_window_indices(
        len(X_development),
        config.cv_splits,
    )

    regression_folds: list[dict] = []
    regression_residuals: list[float] = []
    regression_factory = regression_factories(config.random_seed)[
        regression.family
    ]
    classifier_probabilities: list[np.ndarray] = []
    classifier_truth: list[np.ndarray] = []
    classifier_baseline_predictions: list[np.ndarray] = []
    classification_folds: list[dict] = []

    for fold_number, (train_index, validation_index) in enumerate(folds, 1):
        X_train = X_development[train_index]
        X_validation = X_development[validation_index]
        y_reg_train = y_reg_development[train_index]
        y_reg_validation = y_reg_development[validation_index]
        y_cls_train = y_cls_development[train_index]
        y_cls_validation = y_cls_development[validation_index]

        teacher = regression_factory().fit(X_train, y_reg_train)
        artifact, reg_metrics = _fit_portable_regression(
            teacher,
            X_train,
            X_validation,
            y_reg_validation,
            alpha=regression.tuning["alpha"],
            model_weight=regression.tuning["model_weight"],
        )
        reg_predictions = _evaluate_portable_regression(
            X_validation,
            artifact,
        )
        _, reg_baseline = _regression_baseline(
            X_validation,
            y_reg_validation,
        )
        reg_metrics["skill_vs_persistence"] = (
            1.0 - reg_metrics["mae"] / reg_baseline["mae"]
            if reg_baseline["mae"] > 0 else 0.0
        )
        regression_residuals.extend(
            (y_reg_validation - reg_predictions).astype(float).tolist()
        )
        regression_folds.append({
            "fold": fold_number,
            "train_rows": int(len(train_index)),
            "validation_rows": int(len(validation_index)),
            **reg_metrics,
        })

        try:
            _, cls_metrics, cls_model, cls_scaler = _fit_portable_classifier(
                X_train,
                y_cls_train,
                X_validation,
                y_cls_validation,
                seed=config.random_seed,
                regularization_c=classification.tuning["regularization_c"],
                weight_power=classification.tuning["weight_power"],
                model_weight=classification.tuning["model_weight"],
                temperature=classification.tuning["temperature"],
            )
            probabilities = _blend_classifier_probabilities(
                _temperature_scale_probabilities(
                    _aligned_probabilities(
                        cls_model,
                        cls_scaler.transform(X_validation),
                    ),
                    classification.tuning["temperature"],
                ),
                X_validation,
                classification.tuning["model_weight"],
            )
            classifier_probabilities.append(probabilities)
            classifier_truth.append(y_cls_validation)
            classifier_baseline_predictions.append(
                classes_for_pm25(
                    X_validation[:, FEATURE_COLUMNS.index("pm25_mean")]
                )
            )
            classification_folds.append({
                "fold": fold_number,
                "train_rows": int(len(train_index)),
                "validation_rows": int(len(validation_index)),
                **cls_metrics,
            })
        except ValueError as exc:
            classification_folds.append({
                "fold": fold_number,
                "train_rows": int(len(train_index)),
                "validation_rows": int(len(validation_index)),
                "error": f"{type(exc).__name__}: {exc}",
            })

    regression_aggregate = _mean_numeric_metrics(regression_folds)
    if (
        len(regression_folds) != config.cv_splits
        or regression_aggregate.get("skill_vs_persistence", -1.0)
        < config.regression_minimum_skill
    ):
        regression.eligible = False
        if "expanding_cv_skill_below_threshold" not in regression.eligibility_reasons:
            regression.eligibility_reasons.append(
                "expanding_cv_skill_below_threshold"
            )
    residual_quantiles = {
        name: float(value)
        for name, value in zip(
            ("p10", "p50", "p90"),
            np.quantile(regression_residuals, (0.10, 0.50, 0.90)),
            strict=True,
        )
    }
    regression.runtime_artifact["residual_quantiles"] = residual_quantiles
    regression.runtime_artifact["calibration_rows"] = len(regression_residuals)
    regression.runtime_artifact[
        "calibration_method"
    ] = "expanding_window_out_of_fold_residual"

    classification_aggregate: dict = {}
    classification_baseline: dict = {}
    if len(classifier_probabilities) == config.cv_splits:
        combined_probabilities = np.vstack(classifier_probabilities)
        combined_truth = np.concatenate(classifier_truth)
        combined_predictions = np.asarray(CLASS_IDS)[
            np.argmax(combined_probabilities, axis=1)
        ]
        classification_aggregate = classification_metrics(
            combined_truth,
            combined_predictions,
            combined_probabilities,
        )
        combined_baseline_predictions = np.concatenate(
            classifier_baseline_predictions
        )
        combined_baseline_probabilities = np.zeros(
            (len(combined_truth), len(CLASS_IDS)),
            dtype=float,
        )
        combined_baseline_probabilities[
            np.arange(len(combined_truth)),
            combined_baseline_predictions - 1,
        ] = 1.0
        classification_baseline = classification_metrics(
            combined_truth,
            combined_baseline_predictions,
            combined_baseline_probabilities,
        )
        cv_eligible, cv_reasons, cv_warnings = _classification_eligibility(
            classification_aggregate,
            classification_aggregate,
            classification_baseline,
            combined_probabilities,
            config,
        )
        classification.warnings.extend(
            warning
            for warning in cv_warnings
            if warning not in classification.warnings
        )
        if not cv_eligible:
            classification.eligible = False
            classification.eligibility_reasons.extend(
                f"expanding_cv:{reason}"
                for reason in cv_reasons
                if f"expanding_cv:{reason}"
                not in classification.eligibility_reasons
            )
    else:
        classification.eligible = False
        classification.eligibility_reasons.append(
            "expanding_cv_incomplete"
        )

    audit = {
        "strategy": "expanding_window",
        "folds": config.cv_splits,
        "final_test_excluded": True,
        "regression": {
            "fold_metrics": regression_folds,
            "aggregate": regression_aggregate,
            "residual_quantiles": residual_quantiles,
        },
        "classification": {
            "fold_metrics": classification_folds,
            "aggregate": classification_aggregate,
            "baseline": classification_baseline,
        },
    }
    regression.candidate_validation_metrics[
        "expanding_window_cv"
    ] = audit["regression"]
    classification.candidate_validation_metrics[
        "expanding_window_cv"
    ] = audit["classification"]
    return audit


def _period(rows: pd.DataFrame) -> tuple[str, str]:
    return (
        rows["date"].min().date().isoformat(),
        rows["target_date"].max().date().isoformat(),
    )


def _class_distribution(values: np.ndarray) -> dict[str, int]:
    return {
        str(class_id): int(np.sum(values == class_id))
        for class_id in CLASS_IDS
    }


def _task_registry_row(
    province_id: str,
    run_id: str,
    task_type: str,
    selection: TaskSelection,
    split: ChronologicalSplit,
    config: PipelineConfig,
    audit: dict,
) -> dict:
    suffix = "regressor" if task_type == "regression" else "classifier"
    model_name = f"{selection.family.replace('_', '-')}-{suffix}"
    train_start, train_end = _period(split.train_rows)
    validation_start, validation_end = _period(split.validation_rows)
    test_start, test_end = _period(split.test_rows)
    now = datetime.now(timezone.utc).isoformat()
    params = {
        "task_type": task_type,
        "teacher_model": selection.family,
        "teacher_model_family": selection.family,
        "serving_model_family": (
            "standardized_ridge"
            if task_type == "regression"
            else "standardized_logistic"
        ),
        "runtime_kind": selection.runtime_artifact["artifact_schema"],
        "portable_artifact_sha256": _sha256_json(selection.runtime_artifact),
        "feature_cols": list(FEATURE_COLUMNS),
        "feature_version": FEATURE_VERSION,
        "feature_provenance": FEATURE_PROVENANCE,
        "threshold_version": THRESHOLD_VERSION,
        "serving_policy": config.serving_policy,
        "runtime_metrics": selection.runtime_metrics,
        "teacher_validation_metrics": selection.teacher_validation_metrics,
        "teacher_test_metrics": selection.teacher_test_metrics,
        "production_tuning": selection.tuning,
        "audit": audit,
    }
    if task_type == "regression":
        params["surrogate"] = selection.runtime_artifact
        params["residual_quantiles"] = selection.runtime_artifact[
            "residual_quantiles"
        ]
    else:
        params["portable_classifier"] = selection.runtime_artifact
        params["class_mapping"] = class_mapping()
        params["evidence_status"] = (
            "validated_five_class"
            if selection.eligible
            else "insufficient_evidence"
        )
    return {
        "run_id": run_id,
        "province_id": province_id,
        "task_type": task_type,
        "model_name": model_name,
        "model_family": selection.family,
        "teacher_model_family": selection.family,
        "serving_model_family": params["serving_model_family"],
        "model_version": "dual-pm25-v4",
        "artifact_ref": f"artifacts/{run_id}/{province_id}/{task_type}/model.joblib",
        "feature_schema": {
            "columns": list(FEATURE_COLUMNS),
            "ordered": True,
            "count": len(FEATURE_COLUMNS),
        },
        "feature_version": FEATURE_VERSION,
        "threshold_version": THRESHOLD_VERSION,
        "train_start": train_start,
        "train_end": train_end,
        "validation_start": validation_start,
        "validation_end": validation_end,
        "test_start": test_start,
        "test_end": test_end,
        "training_rows": len(split.y_reg_train),
        "validation_rows": len(split.y_reg_validation),
        "test_rows": len(split.y_reg_test),
        "metrics": selection.test_metrics,
        "baseline_metrics": selection.baseline_metrics,
        "class_distribution": (
            _class_distribution(
                np.concatenate([
                    split.y_cls_train,
                    split.y_cls_validation,
                    split.y_cls_test,
                ])
            )
            if task_type == "classification" else {}
        ),
        "eligibility_status": selection.eligible,
        "eligibility_reason": ",".join(selection.eligibility_reasons),
        "evidence_status": (
            "validated"
            if selection.eligible
            else (
                "insufficient_evidence"
                if task_type == "classification"
                and any(
                    reason.startswith("insufficient_evidence_class:")
                    for reason in selection.eligibility_reasons
                )
                else "ineligible"
            )
        ),
        "is_active": False,
        "trained_at": now,
        "source": OBSERVED_VIEW,
        "code_version": _git_sha(),
        "mae": selection.test_metrics.get("mae"),
        "rmse": selection.test_metrics.get("rmse"),
        "r2": selection.test_metrics.get("r2"),
        "model_params": params,
    }


def train_province(
    province_id: str,
    frame: pd.DataFrame,
    run_id: str,
    config: PipelineConfig,
) -> ProvinceResult:
    prepared = prepare_targets(frame)
    split = chronological_split(prepared, config)
    audit = {
        "missing_value_percentage": float(
            frame.loc[:, FEATURE_COLUMNS].isna().mean().mean() * 100
        ),
        "feature_count": len(FEATURE_COLUMNS),
        "feature_order": list(FEATURE_COLUMNS),
        "feature_provenance": FEATURE_PROVENANCE,
        "synthetic_lineage_allowed": False,
        "threshold_version": THRESHOLD_VERSION,
        "train_period": _period(split.train_rows),
        "validation_period": _period(split.validation_rows),
        "test_period": _period(split.test_rows),
        "train_rows": len(split.y_reg_train),
        "validation_rows": len(split.y_reg_validation),
        "test_rows": len(split.y_reg_test),
        "class_distribution": {
            "train": _class_distribution(split.y_cls_train),
            "validation": _class_distribution(split.y_cls_validation),
            "test": _class_distribution(split.y_cls_test),
        },
        "sarimax_baseline": evaluate_sarimax_baseline(split),
    }
    regression = select_regression(split, config)
    classification = select_classification(split, config)
    audit["expanding_window_validation"] = apply_expanding_window_validation(
        split,
        regression,
        classification,
        config,
    )
    registry_rows = [
        _task_registry_row(
            province_id, run_id, "regression", regression, split, config, audit
        ),
        _task_registry_row(
            province_id, run_id, "classification", classification, split, config, audit
        ),
    ]
    return ProvinceResult(
        province_id, run_id, regression, classification, audit, registry_rows
    )


def save_artifacts(
    result: ProvinceResult,
    output_root: Path,
    config: PipelineConfig,
) -> None:
    for task_type, selection in (
        ("regression", result.regression),
        ("classification", result.classification),
    ):
        target = output_root / result.run_id / result.province_id / task_type
        target.mkdir(parents=True, exist_ok=True)
        model_path = target / "model.joblib"
        joblib.dump(selection.model, model_path)
        native_artifact_sha256 = _sha256_bytes(model_path.read_bytes())
        reloaded = joblib.load(model_path)
        sample = np.zeros((1, len(FEATURE_COLUMNS)), dtype=float)
        prediction = reloaded.predict(sample)
        if len(prediction) != 1:
            raise RuntimeError(f"artifact reload validation failed: {model_path}")
        metadata = {
            "run_id": result.run_id,
            "province_id": result.province_id,
            "task_type": task_type,
            "model_family": selection.family,
            "hyperparameters": reloaded.get_params(),
            "features": list(FEATURE_COLUMNS),
            "feature_version": FEATURE_VERSION,
            "target": (
                "actual next-day PM2.5"
                if task_type == "regression"
                else "class derived from actual next-day PM2.5"
            ),
            "threshold_version": THRESHOLD_VERSION,
            "metrics": selection.test_metrics,
            "baseline_metrics": selection.baseline_metrics,
            "teacher_validation_metrics": selection.teacher_validation_metrics,
            "teacher_test_metrics": selection.teacher_test_metrics,
            "candidate_validation_metrics": selection.candidate_validation_metrics,
            "production_tuning": selection.tuning,
            "eligibility": {
                "eligible": selection.eligible,
                "reasons": selection.eligibility_reasons,
                "warnings": selection.warnings,
            },
            "audit": result.audit,
            "libraries": _library_versions(),
            "python": sys.version.split()[0],
            "git_sha": _git_sha(),
            "native_artifact_sha256": native_artifact_sha256,
            "portable_artifact_sha256": _sha256_json(
                selection.runtime_artifact
            ),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "configuration": {
                **asdict(config),
                "artifact_directory": str(config.artifact_directory),
            },
        }
        (target / "metadata.json").write_text(
            json.dumps(_json_safe(metadata), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        (target / "feature_schema.json").write_text(
            json.dumps(
                {
                    "version": FEATURE_VERSION,
                    "ordered_columns": list(FEATURE_COLUMNS),
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        if task_type == "classification":
            (target / "class_mapping.json").write_text(
                json.dumps(class_mapping(), ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        registry_row = next(
            row
            for row in result.registry_rows
            if row["task_type"] == task_type
        )
        registry_row["artifact_sha256"] = native_artifact_sha256
        registry_row["model_params"][
            "native_artifact_sha256"
        ] = native_artifact_sha256


def upload_artifacts(
    sb: Client,
    result: ProvinceResult,
    output_root: Path,
) -> None:
    """Upload immutable teacher artifacts before registry registration."""
    bucket = sb.storage.from_("model-artifacts")
    dependency_lock = _library_versions()
    for row in result.registry_rows:
        if row.get("artifact_uri"):
            continue
        task_type = row["task_type"]
        local_path = (
            output_root
            / result.run_id
            / result.province_id
            / task_type
            / "model.joblib"
        )
        if not local_path.is_file():
            raise RuntimeError(f"artifact is missing: {local_path}")
        remote_path = (
            f"{result.run_id}/{result.province_id}/"
            f"{task_type}/model.joblib"
        )
        with local_path.open("rb") as file_handle:
            bucket.upload(
                remote_path,
                file_handle,
                {
                    "content-type": "application/octet-stream",
                    "upsert": "false",
                },
            )
        row["artifact_uri"] = f"storage://model-artifacts/{remote_path}"
        row["artifact_byte_size"] = local_path.stat().st_size
        row["artifact_content_type"] = "application/octet-stream"
        row["dependency_lock"] = dependency_lock


def register_and_maybe_activate(
    sb: Client,
    result: ProvinceResult,
    activate: bool,
    artifact_root: Path = Path("training/artifacts"),
) -> None:
    upload_artifacts(sb, result, artifact_root)
    sb.rpc("fn_upsert_model_registry", {"rows": result.registry_rows}).execute()
    if not activate:
        return
    for row in result.registry_rows:
        if not row["eligibility_status"]:
            continue
        sb.rpc(
            "fn_activate_model_task",
            {
                "p_province_id": result.province_id,
                "p_task_type": row["task_type"],
                "p_model_name": row["model_name"],
                "p_run_id": result.run_id,
                "p_allow_ineligible": False,
            },
        ).execute()


def summary_row(result: ProvinceResult) -> dict:
    regression = result.regression
    classification = result.classification
    return {
        "province": result.province_id,
        "best_regression_model": regression.family,
        "regression_mae": regression.test_metrics["mae"],
        "regression_rmse": regression.test_metrics["rmse"],
        "regression_r2": regression.test_metrics["r2"],
        "regression_skill": regression.test_metrics["skill_vs_persistence"],
        "regression_eligible": regression.eligible,
        "best_classifier": classification.family,
        "accuracy": classification.test_metrics["accuracy"],
        "macro_precision": classification.test_metrics["macro_precision"],
        "macro_recall": classification.test_metrics["macro_recall"],
        "macro_f1": classification.test_metrics["macro_f1"],
        "class_4_recall": classification.test_metrics["per_class"]["4"]["recall"],
        "class_5_recall": classification.test_metrics["per_class"]["5"]["recall"],
        "classification_eligible": classification.eligible,
        "fallback_source": (
            "active_classifier"
            if classification.eligible
            else "regression_threshold"
        ),
        "error": result.error,
    }


def main() -> int:
    args = parse_args()
    config = PipelineConfig(
        minimum_rows=args.min_rows,
        cv_splits=args.cv_splits,
        serving_policy=args.serving_policy,
        artifact_directory=args.artifact_dir,
        allowed_model_families=tuple(args.model_family or MODEL_FAMILIES),
    )
    config.validate()
    province_ids = tuple(args.province or PROVINCE_IDS)
    allowed_sources = {
        value.strip().lower()
        for value in (
            args.allowed_source
            or os.environ.get(
                "TRAINING_ALLOWED_SOURCES",
                ",".join(ALLOWED_SOURCES_DEFAULT),
            ).split(",")
        )
        if value.strip()
    }
    sb = get_client()
    raw = fetch_observed_rows(sb, province_ids)
    frame = filter_training_rows(raw, allowed_sources)
    run_id = str(uuid.uuid4())
    results: list[ProvinceResult] = []
    errors: list[dict] = []

    for province_id in province_ids:
        try:
            result = train_province(
                province_id,
                frame[frame["province_id"] == province_id].copy(),
                run_id,
                config,
            )
            save_artifacts(result, args.artifact_dir, config)
            if args.register and not args.dry_run:
                register_and_maybe_activate(
                    sb,
                    result,
                    args.activate,
                    args.artifact_dir,
                )
            results.append(result)
            print(json.dumps(summary_row(result), ensure_ascii=False))
        except Exception as exc:  # province failure must not stop the full run
            error = {
                "province": province_id,
                "error": type(exc).__name__,
                "message": str(exc),
                "traceback": traceback.format_exc(limit=5),
            }
            errors.append(error)
            print(json.dumps(error, ensure_ascii=False), file=sys.stderr)

    summary = {
        "run_id": run_id,
        "register": bool(args.register and not args.dry_run),
        "activate": bool(args.activate),
        "serving_policy": config.serving_policy,
        "threshold_version": THRESHOLD_VERSION,
        "successful_provinces": len(results),
        "failed_provinces": len(errors),
        "results": [summary_row(result) for result in results],
        "errors": errors,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    summary_path = args.artifact_dir / run_id / "run_summary.json"
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(
        json.dumps(_json_safe(summary), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"RUN_SUMMARY={summary_path}")
    return 0 if results else 2


if __name__ == "__main__":
    raise SystemExit(main())
