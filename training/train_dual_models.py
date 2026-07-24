#!/usr/bin/env python3
"""Train independent PM2.5 regressors and classifiers per province.

The classification target is derived from the *actual* next-day PM2.5 value.
Model selection uses chronological validation data; the most recent test split
remains untouched until final evaluation. Registration is inactive by default.
"""

from __future__ import annotations

import argparse
import importlib.metadata
import json
import os
import subprocess
import sys
import traceback
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd
import xgboost as xgb
from catboost import CatBoostClassifier, CatBoostRegressor
from sklearn.base import BaseEstimator, ClassifierMixin, clone
from sklearn.ensemble import (
    AdaBoostClassifier,
    AdaBoostRegressor,
    GradientBoostingClassifier,
    GradientBoostingRegressor,
    RandomForestClassifier,
    RandomForestRegressor,
)
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
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
    FEATURE_COLUMNS,
    FEATURE_VERSION,
    MODEL_FAMILIES,
    PipelineConfig,
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


@dataclass
class ProvinceResult:
    province_id: str
    run_id: str
    regression: TaskSelection
    classification: TaskSelection
    audit: dict
    registry_rows: list[dict]
    error: str | None = None


class EncodedXGBClassifier(BaseEstimator, ClassifierMixin):
    """XGBoost adapter that safely handles one-based and absent PM2.5 classes."""

    def __init__(self, params: dict | None = None):
        self.params = params or {}

    def fit(self, X, y, sample_weight=None):
        self.classes_ = np.unique(np.asarray(y, dtype=np.int64))
        encoded = np.searchsorted(self.classes_, y)
        params = dict(self.params)
        params["objective"] = (
            "multi:softprob" if len(self.classes_) > 2 else "binary:logistic"
        )
        if len(self.classes_) > 2:
            params["num_class"] = len(self.classes_)
        self.model_ = xgb.XGBClassifier(**params)
        fit_kwargs = {}
        if sample_weight is not None:
            fit_kwargs["sample_weight"] = sample_weight
        self.model_.fit(X, encoded, **fit_kwargs)
        return self

    def predict_proba(self, X):
        return self.model_.predict_proba(X)

    def predict(self, X):
        encoded = np.asarray(self.model_.predict(X), dtype=np.int64)
        return self.classes_[encoded]


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
        "numpy", "pandas", "scikit-learn", "xgboost", "lightgbm",
        "catboost", "joblib", "supabase",
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
        *FEATURE_COLUMNS,
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
    for column in (*FEATURE_COLUMNS, "trusted_hours"):
        frame[column] = pd.to_numeric(frame[column], errors="coerce")
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


def regression_factories(seed: int) -> dict[str, Callable[[], object]]:
    return {
        "random_forest": lambda: RandomForestRegressor(
            n_estimators=300, min_samples_leaf=3, random_state=seed, n_jobs=-1
        ),
        "adaboost": lambda: AdaBoostRegressor(
            n_estimators=250, learning_rate=0.04, loss="square", random_state=seed
        ),
        "gradient_boosting": lambda: GradientBoostingRegressor(
            n_estimators=300, max_depth=3, learning_rate=0.04,
            min_samples_leaf=3, random_state=seed,
        ),
        "xgboost": lambda: xgb.XGBRegressor(
            n_estimators=300, max_depth=4, learning_rate=0.04,
            subsample=0.8, colsample_bytree=0.8, objective="reg:squarederror",
            random_state=seed, n_jobs=-1, verbosity=0,
        ),
        "lightgbm": lambda: lgb.LGBMRegressor(
            n_estimators=300, max_depth=4, learning_rate=0.04,
            subsample=0.8, colsample_bytree=0.8, min_child_samples=10,
            random_state=seed, n_jobs=-1, verbose=-1,
        ),
        "catboost": lambda: CatBoostRegressor(
            iterations=300, depth=5, learning_rate=0.04,
            loss_function="RMSE", random_seed=seed,
            verbose=False, allow_writing_files=False,
        ),
    }


def classification_factories(seed: int) -> dict[str, Callable[[], object]]:
    return {
        "random_forest": lambda: RandomForestClassifier(
            n_estimators=300, min_samples_leaf=3, class_weight="balanced",
            random_state=seed, n_jobs=-1,
        ),
        "adaboost": lambda: AdaBoostClassifier(
            n_estimators=250, learning_rate=0.04, random_state=seed,
        ),
        "gradient_boosting": lambda: GradientBoostingClassifier(
            n_estimators=300, max_depth=3, learning_rate=0.04,
            min_samples_leaf=3, random_state=seed,
        ),
        "xgboost": lambda: EncodedXGBClassifier(params={
            "n_estimators": 300,
            "max_depth": 4,
            "learning_rate": 0.04,
            "subsample": 0.8,
            "colsample_bytree": 0.8,
            "random_state": seed,
            "n_jobs": -1,
            "verbosity": 0,
        }),
        "lightgbm": lambda: lgb.LGBMClassifier(
            n_estimators=300, max_depth=4, learning_rate=0.04,
            subsample=0.8, colsample_bytree=0.8, min_child_samples=10,
            class_weight="balanced", random_state=seed, n_jobs=-1, verbose=-1,
        ),
        "catboost": lambda: CatBoostClassifier(
            iterations=300, depth=5, learning_rate=0.04,
            loss_function="MultiClass", auto_class_weights="Balanced",
            random_seed=seed, verbose=False, allow_writing_files=False,
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
    precision, recall, f1, support = precision_recall_fscore_support(
        y_true, y_pred, labels=CLASS_IDS, zero_division=0
    )
    macro = precision_recall_fscore_support(
        y_true, y_pred, average="macro", zero_division=0
    )
    weighted = precision_recall_fscore_support(
        y_true, y_pred, average="weighted", zero_division=0
    )
    result = {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "balanced_accuracy": float(balanced_accuracy_score(y_true, y_pred)),
        "macro_precision": float(macro[0]),
        "macro_recall": float(macro[1]),
        "macro_f1": float(macro[2]),
        "weighted_precision": float(weighted[0]),
        "weighted_recall": float(weighted[1]),
        "weighted_f1": float(weighted[2]),
        "per_class": {
            str(class_id): {
                "precision": float(precision[index]),
                "recall": float(recall[index]),
                "f1": float(f1[index]),
                "support": int(support[index]),
            }
            for index, class_id in enumerate(CLASS_IDS)
        },
        "confusion_matrix": confusion_matrix(
            y_true, y_pred, labels=CLASS_IDS
        ).astype(int).tolist(),
        "test_rows": int(len(y_true)),
    }
    result["log_loss"] = (
        float(log_loss(y_true, probabilities, labels=CLASS_IDS))
        if probabilities is not None else None
    )
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


def _classification_baseline(X: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, dict]:
    current_index = FEATURE_COLUMNS.index("pm25_mean")
    predictions = classes_for_pm25(X[:, current_index])
    probabilities = np.zeros((len(y), len(CLASS_IDS)), dtype=float)
    probabilities[np.arange(len(y)), predictions - 1] = 1.0
    return predictions, classification_metrics(y, predictions, probabilities)


def _portable_regression(
    model: object,
    X_fit: np.ndarray,
    X_test: np.ndarray,
    y_test: np.ndarray,
) -> tuple[dict, dict]:
    scaler = StandardScaler().fit(X_fit)
    teacher_fit = np.asarray(model.predict(X_fit), dtype=float)
    surrogate = Ridge(alpha=1.0).fit(scaler.transform(X_fit), teacher_fit)
    predictions = surrogate.predict(scaler.transform(X_test))
    return {
        "artifact_schema": "standardized-ridge-v1",
        "feature_cols": list(FEATURE_COLUMNS),
        "coefficients": surrogate.coef_.astype(float).tolist(),
        "intercept": float(surrogate.intercept_),
        "scaler_mean": scaler.mean_.astype(float).tolist(),
        "scaler_scale": scaler.scale_.astype(float).tolist(),
    }, regression_metrics(y_test, predictions)


def _portable_classifier(
    X_fit: np.ndarray,
    y_fit: np.ndarray,
    X_test: np.ndarray,
    y_test: np.ndarray,
    seed: int,
) -> tuple[dict, dict]:
    scaler = StandardScaler().fit(X_fit)
    model = LogisticRegression(
        max_iter=2_000,
        class_weight="balanced",
        random_state=seed,
    ).fit(scaler.transform(X_fit), y_fit)
    probabilities = _aligned_probabilities(model, scaler.transform(X_test))
    predictions = np.asarray(CLASS_IDS)[np.argmax(probabilities, axis=1)]
    return {
        "artifact_schema": "standardized-logistic-v1",
        "feature_cols": list(FEATURE_COLUMNS),
        "classes": [int(value) for value in model.classes_],
        "coefficients": np.asarray(model.coef_, dtype=float).tolist(),
        "intercepts": np.asarray(model.intercept_, dtype=float).tolist(),
        "scaler_mean": scaler.mean_.astype(float).tolist(),
        "scaler_scale": scaler.scale_.astype(float).tolist(),
        "threshold_version": THRESHOLD_VERSION,
    }, classification_metrics(y_test, predictions, probabilities)


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
    for class_id in (4, 5):
        per_class = metrics["per_class"][str(class_id)]
        if per_class["support"] < config.critical_class_minimum_support:
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
    validation_baseline_predictions, validation_baseline = _regression_baseline(
        split.X_validation, split.y_reg_validation
    )
    del validation_baseline_predictions
    validation_results: dict[str, dict] = {}
    fitted: dict[str, object] = {}
    factories = regression_factories(config.random_seed)
    for family in config.allowed_model_families:
        factory = factories[family]
        model = factory().fit(split.X_train, split.y_reg_train)
        fitted[family] = model
        validation_results[family] = regression_metrics(
            split.y_reg_validation, model.predict(split.X_validation)
        )
        validation_results[family]["skill_vs_persistence"] = (
            1.0 - validation_results[family]["mae"] / validation_baseline["mae"]
            if validation_baseline["mae"] > 0 else 0.0
        )
    family = max(
        validation_results,
        key=lambda item: (
            validation_results[item]["skill_vs_persistence"],
            -validation_results[item]["mae"],
            -validation_results[item]["rmse"],
        ),
    )
    X_fit = np.vstack([split.X_train, split.X_validation])
    y_fit = np.concatenate([split.y_reg_train, split.y_reg_validation])
    model = clone(fitted[family]).fit(X_fit, y_fit)
    test_predictions = np.asarray(model.predict(split.X_test), dtype=float)
    test_metrics = regression_metrics(split.y_reg_test, test_predictions)
    _, baseline_metrics = _regression_baseline(split.X_test, split.y_reg_test)
    test_metrics["skill_vs_persistence"] = (
        1.0 - test_metrics["mae"] / baseline_metrics["mae"]
        if baseline_metrics["mae"] > 0 else 0.0
    )
    runtime_artifact, runtime_metrics = _portable_regression(
        model, X_fit, split.X_test, split.y_reg_test
    )
    eligible, reasons = _regression_eligibility(
        test_metrics, baseline_metrics, validation_results[family], config
    )
    if runtime_metrics["mae"] >= baseline_metrics["mae"]:
        eligible = False
        reasons = [reason for reason in reasons if reason != "eligible"]
        reasons.append("runtime_artifact_below_baseline")
    return TaskSelection(
        family, model, validation_results[family], test_metrics,
        baseline_metrics, eligible, reasons, [], runtime_artifact, runtime_metrics,
    )


def select_classification(split: ChronologicalSplit, config: PipelineConfig) -> TaskSelection:
    _, validation_baseline = _classification_baseline(
        split.X_validation, split.y_cls_validation
    )
    validation_results: dict[str, dict] = {}
    fitted: dict[str, object] = {}
    factories = classification_factories(config.random_seed)
    for family in config.allowed_model_families:
        factory = factories[family]
        model = _fit_classifier(factory(), split.X_train, split.y_cls_train)
        fitted[family] = model
        probabilities = _aligned_probabilities(model, split.X_validation)
        predictions = np.asarray(CLASS_IDS)[np.argmax(probabilities, axis=1)]
        validation_results[family] = classification_metrics(
            split.y_cls_validation, predictions, probabilities
        )
    family = max(
        validation_results,
        key=lambda item: (
            validation_results[item]["macro_f1"],
            validation_results[item]["per_class"]["5"]["recall"],
            validation_results[item]["per_class"]["4"]["recall"],
            validation_results[item]["balanced_accuracy"],
        ),
    )
    X_fit = np.vstack([split.X_train, split.X_validation])
    y_fit = np.concatenate([split.y_cls_train, split.y_cls_validation])
    model = _fit_classifier(clone(fitted[family]), X_fit, y_fit)
    probabilities = _aligned_probabilities(model, split.X_test)
    predictions = np.asarray(CLASS_IDS)[np.argmax(probabilities, axis=1)]
    test_metrics = classification_metrics(split.y_cls_test, predictions, probabilities)
    _, baseline_metrics = _classification_baseline(split.X_test, split.y_cls_test)
    train_probabilities = _aligned_probabilities(model, X_fit)
    train_predictions = np.asarray(CLASS_IDS)[np.argmax(train_probabilities, axis=1)]
    train_metrics = classification_metrics(y_fit, train_predictions, train_probabilities)
    runtime_artifact, runtime_metrics = _portable_classifier(
        X_fit, y_fit, split.X_test, split.y_cls_test, config.random_seed
    )
    eligible, reasons, warnings = _classification_eligibility(
        train_metrics, test_metrics, baseline_metrics, probabilities, config
    )
    if runtime_metrics["macro_f1"] <= baseline_metrics["macro_f1"]:
        eligible = False
        reasons = [reason for reason in reasons if reason != "eligible"]
        reasons.append("runtime_artifact_below_baseline")
    return TaskSelection(
        family, model, validation_results[family], test_metrics,
        baseline_metrics, eligible, reasons, warnings, runtime_artifact, runtime_metrics,
    )


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
        "runtime_kind": selection.runtime_artifact["artifact_schema"],
        "feature_cols": list(FEATURE_COLUMNS),
        "feature_version": FEATURE_VERSION,
        "threshold_version": THRESHOLD_VERSION,
        "serving_policy": config.serving_policy,
        "runtime_metrics": selection.runtime_metrics,
        "audit": audit,
    }
    if task_type == "regression":
        params["surrogate"] = selection.runtime_artifact
        params["upper_residual_q90"] = 0.0
    else:
        params["portable_classifier"] = selection.runtime_artifact
        params["class_mapping"] = class_mapping()
    return {
        "run_id": run_id,
        "province_id": province_id,
        "task_type": task_type,
        "model_name": model_name,
        "model_family": selection.family,
        "model_version": "dual-pm25-v1",
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
    }
    regression = select_regression(split, config)
    classification = select_classification(split, config)
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
            "eligibility": {
                "eligible": selection.eligible,
                "reasons": selection.eligibility_reasons,
                "warnings": selection.warnings,
            },
            "audit": result.audit,
            "libraries": _library_versions(),
            "python": sys.version.split()[0],
            "git_sha": _git_sha(),
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


def register_and_maybe_activate(
    sb: Client,
    result: ProvinceResult,
    activate: bool,
) -> None:
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
                register_and_maybe_activate(sb, result, args.activate)
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
