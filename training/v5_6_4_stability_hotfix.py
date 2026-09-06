"""Second-pass stability hardening for the reviewed PM2.5 v5.6.4 tuner.

This module layers on top of ``v5_6_4_tuning`` without changing the active
feature schema or deployment thresholds. The first guarded run showed that
aggregate Validation improvement alone can be unstable by province, so this
pass adds a temporal-stability gate inside the 365-day Validation window before
a LightGBM profile is selected.

Selection remains Test-blind:
- Regression candidates must improve aggregate D+1 Validation MAE, preserve
  D+2..D+7, and improve at least three of four chronological D+1 Validation
  segments without material regression in the worst segment.
- Random Forest search adds moderate Class 2-3-focused candidates while Class
  4-5 recall is not allowed to fall below the reviewed CV/Validation baseline.

The production champion/challenger comparison remains the only consumer of the
latest 365-day Test holdout after model selection has finished.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import lightgbm as lgb
import numpy as np
import pandas as pd

import training.v5_6_4_tuning as base
from training.train_pooled_models import _xy


TUNING_REVISION = "v5.6.4-guarded-tuning-v2-stability"
REGRESSION_VALIDATION_SEGMENTS = 4
REGRESSION_REQUIRED_IMPROVED_SEGMENTS = 3
REGRESSION_SEGMENT_NONINFERIOR_TOLERANCE = 0.005
REGRESSION_SEGMENT_IMPROVEMENT_EPSILON = 0.0005

REGRESSION_PROFILES_V2: tuple[dict[str, Any], ...] = (
    {
        "profile": "reviewed_recalibrated",
        "objective": "regression_l1",
        "num_leaves": 31,
        "max_depth": 7,
        "min_child_samples": 30,
        "subsample": 0.90,
        "colsample_bytree": 0.90,
        "reg_lambda": 2.0,
        "learning_rate": 0.025,
    },
    {
        "profile": "stable_shallow",
        "objective": "regression_l1",
        "num_leaves": 19,
        "max_depth": 5,
        "min_child_samples": 50,
        "subsample": 0.95,
        "colsample_bytree": 0.85,
        "reg_lambda": 6.0,
        "reg_alpha": 0.10,
        "learning_rate": 0.020,
    },
    *base.REGRESSION_PROFILES,
)
REGRESSION_CORRECTION_WEIGHTS_V2 = tuple(np.linspace(0.35, 1.10, 16))

CLASSIFICATION_CANDIDATES_V2: tuple[dict[str, Any], ...] = (
    {
        "profile": "mid_focus_moderate",
        "n_estimators": 550,
        "max_depth": 14,
        "min_samples_leaf": 2,
        "max_features": 0.50,
        "class_weight": {1: 0.85, 2: 1.28, 3: 1.38, 4: 1.38, 5: 1.70},
    },
    {
        "profile": "mid_focus_balanced",
        "n_estimators": 600,
        "max_depth": 13,
        "min_samples_leaf": 2,
        "max_features": 0.40,
        "class_weight": {1: 0.88, 2: 1.24, 3: 1.34, 4: 1.40, 5: 1.75},
    },
    {
        "profile": "mid_focus_deeper",
        "n_estimators": 600,
        "max_depth": 16,
        "min_samples_leaf": 2,
        "max_features": "sqrt",
        "class_weight": {1: 0.84, 2: 1.32, 3: 1.45, 4: 1.42, 5: 1.80},
    },
    {
        "profile": "mid_focus_smooth_v2",
        "n_estimators": 650,
        "max_depth": 12,
        "min_samples_leaf": 3,
        "max_features": 0.45,
        "class_weight": {1: 0.88, 2: 1.30, 3: 1.42, 4: 1.45, 5: 1.80},
    },
    *base.CLASSIFICATION_CANDIDATES,
)


def _d1_segment_ratios(
    validation_rows: pd.DataFrame,
    candidate_predictions: np.ndarray,
    baseline_predictions: np.ndarray,
) -> list[float]:
    """Return candidate/reviewed-baseline D+1 MAE ratios in time order."""
    d1 = validation_rows["forecast_horizon_days"].to_numpy(dtype=int) == 1
    rows = validation_rows.loc[d1].copy().reset_index(drop=True)
    candidate = np.asarray(candidate_predictions, dtype=float)[d1]
    baseline = np.asarray(baseline_predictions, dtype=float)[d1]
    truth = rows["target_pm25"].to_numpy(dtype=float)
    dates = pd.to_datetime(rows["date"]).to_numpy()
    unique_dates = np.unique(dates)
    date_segments = [
        segment
        for segment in np.array_split(unique_dates, REGRESSION_VALIDATION_SEGMENTS)
        if len(segment)
    ]
    ratios: list[float] = []
    for segment in date_segments:
        mask = np.isin(dates, segment)
        candidate_mae = float(np.mean(np.abs(truth[mask] - candidate[mask])))
        baseline_mae = float(np.mean(np.abs(truth[mask] - baseline[mask])))
        ratios.append(candidate_mae / max(baseline_mae, 1e-12))
    return ratios


def _segments_are_stable(ratios: list[float]) -> bool:
    if len(ratios) != REGRESSION_VALIDATION_SEGMENTS:
        return False
    improved = sum(
        ratio <= 1.0 - REGRESSION_SEGMENT_IMPROVEMENT_EPSILON
        for ratio in ratios
    )
    return bool(
        improved >= REGRESSION_REQUIRED_IMPROVED_SEGMENTS
        and max(ratios) <= 1.0 + REGRESSION_SEGMENT_NONINFERIOR_TOLERANCE
    )


def _regression_candidate_on_validation_v2(
    train_rows: pd.DataFrame,
    validation_rows: pd.DataFrame,
    *,
    profile: dict[str, Any],
    seed: int,
    baseline_validation_predictions: np.ndarray,
) -> dict[str, Any] | None:
    """Select a temporally stable candidate using Validation only."""
    X_train, y_train_raw = _xy(train_rows, "target_pm25")
    X_validation, y_validation_raw = _xy(validation_rows, "target_pm25")
    persistence_train = train_rows["pm25_mean"].to_numpy(dtype=float)
    persistence_validation = validation_rows["pm25_mean"].to_numpy(dtype=float)
    y_train = y_train_raw - persistence_train
    y_validation = y_validation_raw - persistence_validation

    model_params = {key: value for key, value in profile.items() if key != "profile"}
    validation_model = lgb.LGBMRegressor(
        n_estimators=1200,
        random_state=seed,
        n_jobs=-1,
        verbose=-1,
        **model_params,
    )
    validation_model.fit(
        X_train,
        y_train,
        eval_set=[(X_validation, y_validation)],
        callbacks=[lgb.early_stopping(100, verbose=False)],
    )
    raw_validation = np.asarray(validation_model.predict(X_validation), dtype=float)

    baseline_horizon_mae = base._horizon_mae(
        validation_rows, baseline_validation_predictions
    )
    baseline_d1 = baseline_horizon_mae[1]
    baseline_long_mean = float(
        np.mean([baseline_horizon_mae[h] for h in range(2, 8)])
    )

    best: tuple[tuple[float, ...], dict[str, Any]] | None = None
    for correction_weight in REGRESSION_CORRECTION_WEIGHTS_V2:
        predictions = persistence_validation + correction_weight * raw_validation
        candidate_horizon_mae = base._horizon_mae(validation_rows, predictions)
        long_mean = float(
            np.mean([candidate_horizon_mae[h] for h in range(2, 8)])
        )
        if long_mean > baseline_long_mean * (
            1.0 + base.REGRESSION_LONG_HORIZON_MEAN_TOLERANCE
        ):
            continue
        if any(
            candidate_horizon_mae[h]
            > baseline_horizon_mae[h]
            * (1.0 + base.REGRESSION_PER_HORIZON_TOLERANCE)
            for h in range(2, 8)
        ):
            continue
        if candidate_horizon_mae[1] > baseline_d1 * (
            1.0 - base.REGRESSION_MIN_D1_RELATIVE_GAIN
        ):
            continue

        segment_ratios = _d1_segment_ratios(
            validation_rows, predictions, baseline_validation_predictions
        )
        if not _segments_are_stable(segment_ratios):
            continue
        max_long_ratio = max(
            candidate_horizon_mae[h] / baseline_horizon_mae[h]
            for h in range(2, 8)
        )
        key = (
            max(segment_ratios),
            float(np.mean(segment_ratios)),
            candidate_horizon_mae[1],
            long_mean,
            abs(float(correction_weight) - 0.75),
        )
        payload = {
            "profile": profile["profile"],
            "model_params": model_params,
            "best_iteration": int(validation_model.best_iteration_ or 1200),
            "correction_weight": float(correction_weight),
            "validation_predictions": predictions,
            "validation_horizon_mae": {
                str(k): float(v) for k, v in candidate_horizon_mae.items()
            },
            "baseline_validation_horizon_mae": {
                str(k): float(v) for k, v in baseline_horizon_mae.items()
            },
            "validation_d1_relative_gain": float(
                1.0 - candidate_horizon_mae[1] / baseline_d1
            ),
            "validation_long_mean_ratio": float(long_mean / baseline_long_mean),
            "validation_max_long_horizon_ratio": float(max_long_ratio),
            "validation_d1_segment_ratios": [
                float(value) for value in segment_ratios
            ],
            "validation_d1_improved_segments": int(
                sum(
                    value <= 1.0 - REGRESSION_SEGMENT_IMPROVEMENT_EPSILON
                    for value in segment_ratios
                )
            ),
            "validation_d1_max_segment_ratio": float(max(segment_ratios)),
        }
        if best is None or key < best[0]:
            best = (key, payload)
    return None if best is None else best[1]


def _write_regression_report_v2(result, config) -> None:
    """Keep v1 report compatibility and append temporal-stability evidence."""
    _ORIGINAL_WRITE_REGRESSION_REPORT(result, config)
    output_dir = Path(config.artifact_directory)
    csv_path = output_dir / "v5_6_4_regression_eligibility.csv"
    json_path = output_dir / "v5_6_4_regression_eligibility.json"
    tune_state = result.parameters.get("v5_6_4_tuning", {}).get("province", {})

    frame = pd.read_csv(csv_path)
    frame["validation_d1_improved_segments"] = frame["province_id"].map(
        lambda province_id: tune_state.get(province_id, {}).get(
            "validation_d1_improved_segments"
        )
    )
    frame["validation_d1_max_segment_ratio"] = frame["province_id"].map(
        lambda province_id: tune_state.get(province_id, {}).get(
            "validation_d1_max_segment_ratio"
        )
    )
    frame.to_csv(csv_path, index=False)

    payload = json.loads(json_path.read_text(encoding="utf-8"))
    for row in payload.get("rows", []):
        state = tune_state.get(row["province_id"], {})
        row["validation_d1_segment_ratios"] = state.get(
            "validation_d1_segment_ratios"
        )
        row["validation_d1_improved_segments"] = state.get(
            "validation_d1_improved_segments"
        )
        row["validation_d1_max_segment_ratio"] = state.get(
            "validation_d1_max_segment_ratio"
        )
    payload["trainer_revision"] = TUNING_REVISION
    payload["stability_policy"] = {
        "segments": REGRESSION_VALIDATION_SEGMENTS,
        "required_improved_segments": REGRESSION_REQUIRED_IMPROVED_SEGMENTS,
        "worst_segment_noninferior_tolerance": REGRESSION_SEGMENT_NONINFERIOR_TOLERANCE,
        "selection_data": "validation_only",
    }
    json_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, default=str) + "\n",
        encoding="utf-8",
    )


def install_into_monthly_retrainer() -> None:
    """Install v2 stability guards, then route the canonical monthly trainer."""
    base.TUNING_REVISION = TUNING_REVISION
    base.REGRESSION_PROFILES = REGRESSION_PROFILES_V2
    base.REGRESSION_CORRECTION_WEIGHTS = REGRESSION_CORRECTION_WEIGHTS_V2
    base.CLASSIFICATION_CANDIDATES = CLASSIFICATION_CANDIDATES_V2
    base.CLASSIFICATION_CRITICAL_RECALL_TOLERANCE = 0.0
    base.CLASSIFICATION_OVERALL_TOLERANCE = 0.003
    base.CLASSIFICATION_MIN_MID_F1_GAIN = 0.001
    base._regression_candidate_on_validation = _regression_candidate_on_validation_v2
    base._write_regression_report = _write_regression_report_v2
    base.install_into_monthly_retrainer()


_ORIGINAL_WRITE_REGRESSION_REPORT = base._write_regression_report
