"""Guarded v5.6.4 tuning and audit reporting.

This module deliberately layers on top of the reviewed pooled-tree pipeline
instead of changing the production feature contract. Model selection uses
training/validation evidence only. The frozen/latest test partition is read
only after a candidate configuration has been selected.

Regression:
- starts from the reviewed per-province residual LightGBM result;
- re-tunes only provinces whose validation D+1 skill is below the trigger;
- accepts a replacement only when validation D+1 MAE improves while D+2..D+7
  aggregate MAE and each individual horizon stay inside a tight guard versus
  the reviewed baseline configuration.

Classification:
- starts from the reviewed pooled Random Forest result;
- compares two class-weight/tree candidates on purged walk-forward CV;
- emphasizes Classes 2 and 3 F1;
- refuses a candidate if Class 4/5 recall, macro F1, or balanced accuracy fall
  outside the guard versus the reviewed baseline CV;
- validates the same guard once more on the 365-day validation partition before
  the final train+validation fit.

Every run writes compact machine-readable regression eligibility and
classification focus reports plus chart data for Colab/Actions artifacts.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier

from api.ml.portable_trees import (
    evaluate_lightgbm_regressor,
    evaluate_random_forest_classifier,
    export_lightgbm_regressor,
    export_random_forest_classifier,
)
from training.dual_model_config import (
    POOLED_FEATURE_COLUMNS,
    POOLED_FEATURE_VERSION,
)
from training.pm25_classes import CLASS_IDS, THRESHOLD_VERSION
from training.train_dual_models import (
    _classification_eligibility,
    _regression_eligibility,
    classification_metrics,
    regression_metrics,
)
import training.train_pooled_models as pooled


TUNING_REVISION = "v5.6.4-guarded-tuning-v1"

REGRESSION_VALIDATION_SKILL_TRIGGER = 0.075
REGRESSION_LONG_HORIZON_MEAN_TOLERANCE = 0.005
REGRESSION_PER_HORIZON_TOLERANCE = 0.015
REGRESSION_MIN_D1_RELATIVE_GAIN = 0.001
REGRESSION_CORRECTION_WEIGHTS = tuple(np.linspace(0.55, 1.20, 14))
REGRESSION_PROFILES: tuple[dict[str, Any], ...] = (
    {
        "profile": "balanced_capacity",
        "objective": "regression_l1",
        "num_leaves": 39,
        "max_depth": 7,
        "min_child_samples": 24,
        "subsample": 0.92,
        "colsample_bytree": 0.90,
        "reg_lambda": 2.5,
        "reg_alpha": 0.05,
        "learning_rate": 0.022,
    },
    {
        "profile": "smooth_generalization",
        "objective": "regression_l1",
        "num_leaves": 25,
        "max_depth": 6,
        "min_child_samples": 42,
        "subsample": 0.95,
        "colsample_bytree": 0.88,
        "reg_lambda": 4.0,
        "reg_alpha": 0.10,
        "learning_rate": 0.025,
    },
    {
        "profile": "responsive_regularized",
        "objective": "huber",
        "alpha": 0.85,
        "num_leaves": 31,
        "max_depth": 7,
        "min_child_samples": 28,
        "subsample": 0.90,
        "colsample_bytree": 0.92,
        "reg_lambda": 3.0,
        "reg_alpha": 0.08,
        "learning_rate": 0.025,
    },
)

CLASSIFICATION_CRITICAL_RECALL_TOLERANCE = 0.005
CLASSIFICATION_OVERALL_TOLERANCE = 0.005
CLASSIFICATION_MIN_MID_F1_GAIN = 0.002
CLASSIFICATION_CANDIDATES: tuple[dict[str, Any], ...] = (
    {
        "profile": "mid_focus_guarded",
        "n_estimators": 500,
        "max_depth": 14,
        "min_samples_leaf": 2,
        "max_features": "sqrt",
        "class_weight": {1: 0.90, 2: 1.20, 3: 1.28, 4: 1.35, 5: 1.65},
    },
    {
        "profile": "mid_focus_smooth",
        "n_estimators": 550,
        "max_depth": 12,
        "min_samples_leaf": 3,
        "max_features": "sqrt",
        "class_weight": {1: 0.90, 2: 1.25, 3: 1.32, 4: 1.40, 5: 1.75},
    },
)
TEMPERATURE_CANDIDATES = (0.75, 1.0, 1.25, 1.5)


def _d1_mask(frame: pd.DataFrame) -> np.ndarray:
    return frame["forecast_horizon_days"].to_numpy(dtype=int) == 1


def _horizon_mae(
    frame: pd.DataFrame,
    predictions: np.ndarray,
    horizons: tuple[int, ...] = tuple(range(1, 8)),
) -> dict[int, float]:
    truth = frame["target_pm25"].to_numpy(dtype=float)
    horizon_values = frame["forecast_horizon_days"].to_numpy(dtype=int)
    return {
        horizon: float(
            np.mean(
                np.abs(
                    truth[horizon_values == horizon]
                    - predictions[horizon_values == horizon]
                )
            )
        )
        for horizon in horizons
        if np.any(horizon_values == horizon)
    }


def _validation_regression_skill(
    frame: pd.DataFrame,
    predictions: np.ndarray,
) -> float:
    mask = _d1_mask(frame)
    truth = frame.loc[mask, "target_pm25"].to_numpy(dtype=float)
    pred = predictions[mask]
    persistence = frame.loc[mask, "pm25_mean"].to_numpy(dtype=float)
    candidate_mae = float(np.mean(np.abs(truth - pred)))
    baseline_mae = float(np.mean(np.abs(truth - persistence)))
    return 1.0 - candidate_mae / baseline_mae if baseline_mae > 0 else 0.0


def _regression_candidate_on_validation(
    train_rows: pd.DataFrame,
    validation_rows: pd.DataFrame,
    *,
    profile: dict[str, Any],
    seed: int,
    baseline_validation_predictions: np.ndarray,
) -> dict[str, Any] | None:
    X_train, y_train_raw = pooled._xy(train_rows, "target_pm25")
    X_validation, y_validation_raw = pooled._xy(validation_rows, "target_pm25")
    baseline_train = train_rows["pm25_mean"].to_numpy(dtype=float)
    baseline_validation = validation_rows["pm25_mean"].to_numpy(dtype=float)
    y_train = y_train_raw - baseline_train
    y_validation = y_validation_raw - baseline_validation

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

    baseline_mae = _horizon_mae(validation_rows, baseline_validation_predictions)
    baseline_long_mean = float(np.mean([baseline_mae[h] for h in range(2, 8)]))
    baseline_d1 = baseline_mae[1]

    best: tuple[tuple[float, float, float], dict[str, Any]] | None = None
    for correction_weight in REGRESSION_CORRECTION_WEIGHTS:
        predictions = baseline_validation + correction_weight * raw_validation
        candidate_mae = _horizon_mae(validation_rows, predictions)
        long_mean = float(np.mean([candidate_mae[h] for h in range(2, 8)]))
        if long_mean > baseline_long_mean * (
            1.0 + REGRESSION_LONG_HORIZON_MEAN_TOLERANCE
        ):
            continue
        if any(
            candidate_mae[h]
            > baseline_mae[h] * (1.0 + REGRESSION_PER_HORIZON_TOLERANCE)
            for h in range(2, 8)
        ):
            continue
        if candidate_mae[1] > baseline_d1 * (1.0 - REGRESSION_MIN_D1_RELATIVE_GAIN):
            continue
        max_long_ratio = max(
            candidate_mae[h] / baseline_mae[h] for h in range(2, 8)
        )
        key = (candidate_mae[1], long_mean, max_long_ratio)
        payload = {
            "profile": profile["profile"],
            "model_params": model_params,
            "best_iteration": int(validation_model.best_iteration_ or 1200),
            "correction_weight": float(correction_weight),
            "validation_predictions": predictions,
            "validation_horizon_mae": {
                str(k): float(v) for k, v in candidate_mae.items()
            },
            "baseline_validation_horizon_mae": {
                str(k): float(v) for k, v in baseline_mae.items()
            },
            "validation_d1_relative_gain": float(
                1.0 - candidate_mae[1] / baseline_d1
            ),
            "validation_long_mean_ratio": float(long_mean / baseline_long_mean),
            "validation_max_long_horizon_ratio": float(max_long_ratio),
        }
        if best is None or key < best[0]:
            best = (key, payload)
    return None if best is None else best[1]


def _refit_regression_candidate(
    train_rows: pd.DataFrame,
    validation_rows: pd.DataFrame,
    test_rows: pd.DataFrame,
    selection: dict[str, Any],
    *,
    seed: int,
) -> dict[str, Any]:
    fit_rows = pd.concat([train_rows, validation_rows], ignore_index=True)
    X_fit, y_fit_raw = pooled._xy(fit_rows, "target_pm25")
    baseline_fit = fit_rows["pm25_mean"].to_numpy(dtype=float)
    y_fit = y_fit_raw - baseline_fit
    X_test, _ = pooled._xy(test_rows, "target_pm25")
    baseline_test = test_rows["pm25_mean"].to_numpy(dtype=float)

    model = lgb.LGBMRegressor(
        n_estimators=int(selection["best_iteration"]),
        random_state=seed,
        n_jobs=-1,
        verbose=-1,
        **selection["model_params"],
    ).fit(X_fit, y_fit)
    correction_weight = float(selection["correction_weight"])
    raw_test = np.asarray(model.predict(X_test), dtype=float)
    test_predictions = baseline_test + correction_weight * raw_test
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
    if not np.allclose(portable, test_predictions[:100], atol=1e-10, rtol=1e-10):
        raise RuntimeError(
            "v5.6.4 tuned portable residual LightGBM artifact differs from native predictions"
        )
    return {"model": model, "artifact": artifact, "test_predictions": test_predictions}


def _recompute_regression_task(
    result: pooled.TrainedTask,
    split: pooled.PooledSplit,
    config,
) -> None:
    assert result.validation_predictions is not None
    assert result.test_predictions is not None
    validation_predictions = np.asarray(result.validation_predictions, dtype=float)
    test_predictions = np.asarray(result.test_predictions, dtype=float)

    province_metrics: dict[str, dict] = {}
    for province_id in sorted(split.test["province_id"].unique()):
        validation_mask = split.validation["province_id"].to_numpy() == province_id
        test_mask = split.test["province_id"].to_numpy() == province_id
        validation_rows = split.validation.loc[validation_mask]
        test_rows = split.test.loc[test_mask]
        d1_validation = _d1_mask(validation_rows)
        d1_test = _d1_mask(test_rows)

        local_validation = regression_metrics(
            validation_rows.loc[d1_validation, "target_pm25"].to_numpy(dtype=float),
            validation_predictions[validation_mask][d1_validation],
        )
        local_test = regression_metrics(
            test_rows.loc[d1_test, "target_pm25"].to_numpy(dtype=float),
            test_predictions[test_mask][d1_test],
        )
        _, baseline = pooled._regression_baseline(test_rows.loc[d1_test])
        local_test["skill_vs_persistence"] = (
            1.0 - local_test["mae"] / baseline["mae"]
            if baseline["mae"] > 0
            else 0.0
        )
        eligible, reasons = _regression_eligibility(
            local_test, baseline, local_validation, config
        )
        tuning = (
            result.parameters.get("v5_6_4_tuning", {})
            .get("province", {})
            .get(province_id, {})
        )
        local_test.update(
            {
                "eligible": bool(eligible),
                "eligibility_reasons": reasons,
                "baseline": baseline,
                "validation": local_validation,
                "correction_weight": result.parameters["by_province"][province_id].get(
                    "correction_weight"
                ),
                "v5_6_4_tuning": tuning,
            }
        )
        province_metrics[province_id] = local_test

    y_validation = split.validation["target_pm25"].to_numpy(dtype=float)
    validation_metrics = regression_metrics(y_validation, validation_predictions)
    _, validation_baseline = pooled._regression_baseline(split.validation)
    validation_metrics["skill_vs_persistence"] = (
        1.0 - validation_metrics["mae"] / validation_baseline["mae"]
    )

    y_test = split.test["target_pm25"].to_numpy(dtype=float)
    test_all = regression_metrics(y_test, test_predictions)
    d1_mask = _d1_mask(split.test)
    d1_rows = split.test.loc[d1_mask]
    d1_metrics = regression_metrics(y_test[d1_mask], test_predictions[d1_mask])
    _, baseline_d1 = pooled._regression_baseline(d1_rows)
    d1_metrics["skill_vs_persistence"] = 1.0 - d1_metrics["mae"] / baseline_d1["mae"]
    d1_metrics["all_horizons"] = test_all
    d1_metrics["by_horizon"] = pooled._metrics_by_horizon(
        split.test, test_predictions, task="regression"
    )
    aggregate_eligible, reasons = _regression_eligibility(
        d1_metrics, baseline_d1, validation_metrics, config
    )
    failed = [
        province_id
        for province_id, metrics in province_metrics.items()
        if not metrics["eligible"]
    ]
    global_eligible = bool(aggregate_eligible and not failed)
    if failed:
        reasons = [*reasons, f"province_gate_failed:{','.join(failed)}"]
    pooled._record_global_eligibility_context(province_metrics, global_eligible)

    residuals = y_validation - validation_predictions
    validation_horizons = split.validation["forecast_horizon_days"].to_numpy(dtype=int)
    result.residual_quantiles_by_horizon = {
        str(horizon): {
            name: float(value)
            for name, value in zip(
                ("p10", "p50", "p90"),
                np.quantile(
                    residuals[validation_horizons == horizon], (0.10, 0.50, 0.90)
                ),
                strict=True,
            )
        }
        for horizon in pooled.DIRECT_HORIZONS
    }
    result.validation_metrics = validation_metrics
    result.test_metrics = d1_metrics
    result.baseline_metrics = baseline_d1
    result.global_eligible = global_eligible
    result.global_reasons = reasons
    result.province_metrics = province_metrics


def _write_regression_report(
    result: pooled.TrainedTask,
    config,
) -> None:
    output_dir = Path(config.artifact_directory)
    output_dir.mkdir(parents=True, exist_ok=True)
    rows: list[dict[str, Any]] = []
    tune_state = result.parameters.get("v5_6_4_tuning", {}).get("province", {})
    for province_id, metrics in sorted(result.province_metrics.items()):
        skill = float(metrics.get("skill_vs_persistence", float("nan")))
        tuning = tune_state.get(province_id, {})
        rows.append(
            {
                "province_id": province_id,
                "eligible": bool(metrics.get("eligible")),
                "skill_vs_persistence": skill,
                "skill_percent": skill * 100.0,
                "required_skill_percent": float(config.regression_minimum_skill)
                * 100.0,
                "margin_to_gate_percentage_points": (
                    skill - float(config.regression_minimum_skill)
                )
                * 100.0,
                "mae": metrics.get("mae"),
                "baseline_mae": metrics.get("baseline", {}).get("mae"),
                "validation_mae": metrics.get("validation", {}).get("mae"),
                "eligibility_reasons": metrics.get("eligibility_reasons", []),
                "tuning_attempted": bool(tuning.get("attempted")),
                "tuning_selected": bool(tuning.get("selected")),
                "selected_profile": tuning.get(
                    "selected_profile", "reviewed_baseline"
                ),
                "validation_d1_skill_before": tuning.get(
                    "validation_d1_skill_before"
                ),
                "validation_d1_skill_after": tuning.get(
                    "validation_d1_skill_after"
                ),
                "validation_long_mean_ratio": tuning.get(
                    "validation_long_mean_ratio"
                ),
                "validation_max_long_horizon_ratio": tuning.get(
                    "validation_max_long_horizon_ratio"
                ),
            }
        )
    frame = pd.DataFrame(rows).sort_values("skill_vs_persistence")
    frame.to_csv(output_dir / "v5_6_4_regression_eligibility.csv", index=False)
    payload = {
        "trainer_revision": TUNING_REVISION,
        "strict_skill_threshold": float(config.regression_minimum_skill),
        "failed_provinces": frame.loc[~frame["eligible"], "province_id"].tolist(),
        "rows": frame.to_dict(orient="records"),
    }
    (output_dir / "v5_6_4_regression_eligibility.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, default=str) + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "v5_6_4_regression_eligibility": {
                    "failed_provinces": payload["failed_provinces"],
                    "weakest": frame.head(5)[
                        [
                            "province_id",
                            "skill_percent",
                            "margin_to_gate_percentage_points",
                            "eligibility_reasons",
                            "selected_profile",
                        ]
                    ].to_dict(orient="records"),
                }
            },
            ensure_ascii=False,
            default=str,
        ),
        flush=True,
    )


def train_regression_v5_6_4(
    split: pooled.PooledSplit,
    config,
    *args,
    **kwargs,
) -> pooled.TrainedTask:
    """Run reviewed regression first, then guarded validation-only local tuning."""
    result = pooled.train_regression(split, config, *args, **kwargs)
    if result.validation_predictions is None or result.test_predictions is None:
        raise RuntimeError("v5.6.4 tuning requires retained regression predictions")

    result.parameters.setdefault("v5_6_4_tuning", {})
    state: dict[str, Any] = result.parameters["v5_6_4_tuning"]
    state.update(
        {
            "revision": TUNING_REVISION,
            "selection_data": "training_and_validation_only",
            "validation_skill_trigger": REGRESSION_VALIDATION_SKILL_TRIGGER,
            "long_horizon_mean_tolerance": REGRESSION_LONG_HORIZON_MEAN_TOLERANCE,
            "per_horizon_tolerance": REGRESSION_PER_HORIZON_TOLERANCE,
            "minimum_d1_relative_gain": REGRESSION_MIN_D1_RELATIVE_GAIN,
            "province": {},
        }
    )

    validation_predictions = np.asarray(result.validation_predictions, dtype=float).copy()
    test_predictions = np.asarray(result.test_predictions, dtype=float).copy()

    for province_id in sorted(split.train["province_id"].unique()):
        train_rows = split.train[split.train["province_id"] == province_id]
        validation_mask = split.validation["province_id"].to_numpy() == province_id
        test_mask = split.test["province_id"].to_numpy() == province_id
        validation_rows = split.validation.loc[validation_mask]
        test_rows = split.test.loc[test_mask]
        baseline_validation_predictions = validation_predictions[validation_mask].copy()
        validation_skill_before = _validation_regression_skill(
            validation_rows, baseline_validation_predictions
        )
        province_state: dict[str, Any] = {
            "attempted": validation_skill_before < REGRESSION_VALIDATION_SKILL_TRIGGER,
            "selected": False,
            "selected_profile": "reviewed_baseline",
            "validation_d1_skill_before": float(validation_skill_before),
            "validation_d1_skill_after": float(validation_skill_before),
        }
        state["province"][province_id] = province_state
        if not province_state["attempted"]:
            continue

        best: tuple[tuple[float, float, float], dict[str, Any]] | None = None
        for profile in REGRESSION_PROFILES:
            selection = _regression_candidate_on_validation(
                train_rows,
                validation_rows,
                profile=profile,
                seed=config.random_seed,
                baseline_validation_predictions=baseline_validation_predictions,
            )
            if selection is None:
                continue
            horizon_mae = selection["validation_horizon_mae"]
            key = (
                float(horizon_mae["1"]),
                float(selection["validation_long_mean_ratio"]),
                float(selection["validation_max_long_horizon_ratio"]),
            )
            if best is None or key < best[0]:
                best = (key, selection)
        if best is None:
            continue

        selection = best[1]
        refit = _refit_regression_candidate(
            train_rows, validation_rows, test_rows, selection, seed=config.random_seed
        )
        validation_predictions[validation_mask] = np.asarray(
            selection["validation_predictions"], dtype=float
        )
        test_predictions[test_mask] = np.asarray(refit["test_predictions"], dtype=float)
        result.model[province_id] = refit["model"]
        result.runtime_artifact[province_id] = refit["artifact"]
        local_residuals = (
            validation_rows["target_pm25"].to_numpy(dtype=float)
            - validation_predictions[validation_mask]
        )
        local_horizons = validation_rows["forecast_horizon_days"].to_numpy(dtype=int)
        local_quantiles = {
            str(horizon): {
                name: float(value)
                for name, value in zip(
                    ("p10", "p50", "p90"),
                    np.quantile(
                        local_residuals[local_horizons == horizon],
                        (0.10, 0.50, 0.90),
                    ),
                    strict=True,
                )
            }
            for horizon in pooled.DIRECT_HORIZONS
        }
        result.parameters["by_province"][province_id] = {
            **selection["model_params"],
            "profile": selection["profile"],
            "n_estimators": int(selection["best_iteration"]),
            "correction_weight": float(selection["correction_weight"]),
            "target": "target_pm25_minus_pm25_mean",
            "selection": "guarded_validation_d1_with_d2_d7_preservation",
            "residual_quantiles_by_horizon": local_quantiles,
        }
        validation_skill_after = _validation_regression_skill(
            validation_rows, validation_predictions[validation_mask]
        )
        province_state.update(
            {
                "selected": True,
                "selected_profile": selection["profile"],
                "validation_d1_skill_after": float(validation_skill_after),
                "validation_d1_relative_gain": float(
                    selection["validation_d1_relative_gain"]
                ),
                "validation_long_mean_ratio": float(
                    selection["validation_long_mean_ratio"]
                ),
                "validation_max_long_horizon_ratio": float(
                    selection["validation_max_long_horizon_ratio"]
                ),
                "validation_horizon_mae": selection["validation_horizon_mae"],
                "baseline_validation_horizon_mae": selection[
                    "baseline_validation_horizon_mae"
                ],
            }
        )

    result.validation_predictions = validation_predictions
    result.test_predictions = test_predictions
    _recompute_regression_task(result, split, config)
    _write_regression_report(result, config)
    _write_chart_data(result, None, config)
    return result


def _class_metric(metrics: dict, class_id: int, key: str) -> float:
    return float(metrics["per_class"][str(class_id)][key])


def _mid_f1(metrics: dict) -> float:
    return float(
        np.mean([_class_metric(metrics, class_id, "f1") for class_id in (2, 3)])
    )


def _rf_from_candidate(candidate: dict[str, Any], seed: int) -> RandomForestClassifier:
    params = {
        key: value
        for key, value in candidate.items()
        if key not in {"profile", "class_weight"}
    }
    return RandomForestClassifier(
        class_weight=candidate["class_weight"],
        random_state=seed,
        n_jobs=-1,
        **params,
    )


def _evaluate_rf_candidate_cv(
    split: pooled.PooledSplit,
    config,
    candidate: dict[str, Any],
) -> dict[str, Any]:
    truth_parts: list[np.ndarray] = []
    probability_parts: list[np.ndarray] = []
    folds = pooled.pooled_walk_forward_folds(split.train, config.cv_splits)
    for fold_train, fold_validation in folds:
        X_train, y_train = pooled._xy(fold_train, "target_air_quality_class")
        X_validation, y_validation = pooled._xy(
            fold_validation, "target_air_quality_class"
        )
        model = _rf_from_candidate(candidate, config.random_seed).fit(X_train, y_train)
        truth_parts.append(np.asarray(y_validation, dtype=int))
        probability_parts.append(pooled._aligned_rf_probabilities(model, X_validation))
    truth = np.concatenate(truth_parts)
    raw_probabilities = np.concatenate(probability_parts)
    predictions = np.asarray(CLASS_IDS)[np.argmax(raw_probabilities, axis=1)]
    metrics = classification_metrics(truth, predictions, raw_probabilities)
    return {
        "profile": candidate["profile"],
        "candidate": candidate,
        "metrics": metrics,
        "mid_f1": _mid_f1(metrics),
    }


def _classification_candidate_passes_cv_guard(
    candidate_metrics: dict,
    baseline_metrics: dict,
) -> bool:
    if (
        candidate_metrics["macro_f1"]
        < baseline_metrics["macro_f1"] - CLASSIFICATION_OVERALL_TOLERANCE
    ):
        return False
    if (
        candidate_metrics["balanced_accuracy"]
        < baseline_metrics["balanced_accuracy"] - CLASSIFICATION_OVERALL_TOLERANCE
    ):
        return False
    for class_id in (4, 5):
        if (
            _class_metric(candidate_metrics, class_id, "recall")
            < _class_metric(baseline_metrics, class_id, "recall")
            - CLASSIFICATION_CRITICAL_RECALL_TOLERANCE
        ):
            return False
    return True


def _best_temperature(
    model: RandomForestClassifier,
    X_validation: np.ndarray,
    y_validation: np.ndarray,
) -> tuple[float, dict]:
    raw = pooled._aligned_rf_probabilities(model, X_validation)
    best: tuple[float, float, dict] | None = None
    for temperature in TEMPERATURE_CANDIDATES:
        probabilities = pooled._temperature_scale(raw, temperature)
        predictions = np.asarray(CLASS_IDS)[np.argmax(probabilities, axis=1)]
        metrics = classification_metrics(y_validation, predictions, probabilities)
        log_loss = float(metrics["log_loss"] or 1e9)
        key = (log_loss, float(metrics["expected_calibration_error"] or 1e9))
        if best is None or key < (best[0], best[1]):
            best = (key[0], key[1], {"temperature": temperature, "metrics": metrics})
    assert best is not None
    return float(best[2]["temperature"]), best[2]["metrics"]


def _build_tuned_classification_task(
    baseline: pooled.TrainedTask,
    split: pooled.PooledSplit,
    config,
    selected: dict[str, Any],
    cv_metrics: dict,
) -> pooled.TrainedTask | None:
    candidate = selected["candidate"]
    X_train, y_train = pooled._xy(split.train, "target_air_quality_class")
    X_validation, y_validation = pooled._xy(
        split.validation, "target_air_quality_class"
    )
    validation_model = _rf_from_candidate(candidate, config.random_seed).fit(
        X_train, y_train
    )
    temperature, validation_metrics = _best_temperature(
        validation_model, X_validation, y_validation
    )
    baseline_validation = baseline.validation_metrics
    if (
        _mid_f1(validation_metrics)
        < _mid_f1(baseline_validation) + CLASSIFICATION_MIN_MID_F1_GAIN
    ):
        return None
    for class_id in (4, 5):
        if (
            _class_metric(validation_metrics, class_id, "recall")
            < _class_metric(baseline_validation, class_id, "recall")
            - CLASSIFICATION_CRITICAL_RECALL_TOLERANCE
        ):
            return None
    if (
        validation_metrics["macro_f1"]
        < baseline_validation["macro_f1"] - CLASSIFICATION_OVERALL_TOLERANCE
    ):
        return None
    if (
        validation_metrics["balanced_accuracy"]
        < baseline_validation["balanced_accuracy"] - CLASSIFICATION_OVERALL_TOLERANCE
    ):
        return None

    validation_raw = pooled._aligned_rf_probabilities(validation_model, X_validation)
    validation_probabilities = pooled._temperature_scale(validation_raw, temperature)
    validation_predictions = np.asarray(CLASS_IDS)[
        np.argmax(validation_probabilities, axis=1)
    ]
    validation_metrics = classification_metrics(
        y_validation, validation_predictions, validation_probabilities
    )
    validation_metrics["rolling_cv"] = cv_metrics
    validation_metrics["rolling_cv_policy"] = {
        "selection": "guarded_class_2_3_f1_with_class_4_5_recall_preservation",
        "selected_profile": candidate["profile"],
        "candidate_profiles": [value["profile"] for value in CLASSIFICATION_CANDIDATES],
        "critical_recall_tolerance": CLASSIFICATION_CRITICAL_RECALL_TOLERANCE,
        "overall_metric_tolerance": CLASSIFICATION_OVERALL_TOLERANCE,
        "minimum_mid_f1_gain": CLASSIFICATION_MIN_MID_F1_GAIN,
    }

    fit_rows = pd.concat([split.train, split.validation], ignore_index=True)
    X_fit, y_fit = pooled._xy(fit_rows, "target_air_quality_class")
    model = _rf_from_candidate(candidate, config.random_seed).fit(X_fit, y_fit)
    X_test, y_test = pooled._xy(split.test, "target_air_quality_class")
    probabilities = pooled._temperature_scale(
        pooled._aligned_rf_probabilities(model, X_test), temperature
    )
    predictions = np.asarray(CLASS_IDS)[np.argmax(probabilities, axis=1)]
    d1_mask = _d1_mask(split.test)
    d1_rows = split.test.loc[d1_mask]
    d1_metrics = classification_metrics(
        y_test[d1_mask], predictions[d1_mask], probabilities[d1_mask]
    )
    _, _, baseline_d1 = pooled._classification_baseline(d1_rows)
    train_probabilities = pooled._temperature_scale(
        pooled._aligned_rf_probabilities(model, X_fit), temperature
    )
    train_predictions = np.asarray(CLASS_IDS)[np.argmax(train_probabilities, axis=1)]
    train_metrics = classification_metrics(y_fit, train_predictions, train_probabilities)
    eligible, reasons, warnings = _classification_eligibility(
        train_metrics, d1_metrics, baseline_d1, probabilities[d1_mask], config
    )
    reasons = [*reasons, *[f"warning:{warning}" for warning in warnings]]

    artifact = export_random_forest_classifier(
        model,
        POOLED_FEATURE_COLUMNS,
        feature_version=POOLED_FEATURE_VERSION,
        threshold_version=THRESHOLD_VERSION,
        temperature=temperature,
    )
    portable = np.asarray(
        [
            [
                evaluate_random_forest_classifier(row, artifact)[str(class_id)]
                for class_id in CLASS_IDS
            ]
            for row in X_test[:100]
        ]
    )
    if not np.allclose(portable, probabilities[:100], atol=1e-10, rtol=1e-10):
        raise RuntimeError(
            "v5.6.4 tuned portable Random Forest artifact differs from native probabilities"
        )

    province_metrics: dict[str, dict] = {}
    for province_id in sorted(d1_rows["province_id"].unique()):
        mask = d1_mask & (split.test["province_id"].to_numpy() == province_id)
        metrics = classification_metrics(y_test[mask], predictions[mask], probabilities[mask])
        _, _, local_baseline = pooled._classification_baseline(split.test.loc[mask])
        metrics["eligible"] = bool(
            eligible
            and metrics["test_rows"] >= config.minimum_test_rows
            and metrics["macro_f1"] > local_baseline["macro_f1"]
            and metrics["balanced_accuracy"] > local_baseline["balanced_accuracy"]
            and metrics["weighted_f1"] > local_baseline["weighted_f1"]
        )
        metrics["baseline"] = local_baseline
        province_metrics[province_id] = metrics

    d1_metrics["all_horizons"] = classification_metrics(
        y_test, predictions, probabilities
    )
    return pooled.TrainedTask(
        "classification",
        pooled.POOLED_CLASSIFICATION_FAMILY,
        model,
        validation_metrics,
        d1_metrics,
        baseline_d1,
        {
            **{key: value for key, value in candidate.items() if key != "profile"},
            "profile": candidate["profile"],
            "temperature": temperature,
            "v5_6_4_tuning": {
                "revision": TUNING_REVISION,
                "selection_data": "purged_walk_forward_cv_and_validation_only",
                "baseline_mid_f1_cv": _mid_f1(
                    baseline.validation_metrics.get(
                        "rolling_cv", baseline.validation_metrics
                    )
                ),
                "selected_mid_f1_cv": _mid_f1(cv_metrics),
            },
        },
        artifact,
        {},
        bool(eligible),
        reasons,
        province_metrics,
        validation_predictions,
        predictions,
    )


def _write_classification_report(result: pooled.TrainedTask, config) -> None:
    output_dir = Path(config.artifact_directory)
    output_dir.mkdir(parents=True, exist_ok=True)
    test = result.test_metrics
    payload = {
        "trainer_revision": TUNING_REVISION,
        "profile": result.parameters.get("profile", "reviewed_baseline"),
        "temperature": result.parameters.get("temperature"),
        "accuracy": test.get("accuracy"),
        "balanced_accuracy": test.get("balanced_accuracy"),
        "macro_f1": test.get("macro_f1"),
        "weighted_f1": test.get("weighted_f1"),
        "per_class": test.get("per_class"),
        "class_2_3_mean_f1": _mid_f1(test),
        "critical_class_recall": {
            str(class_id): _class_metric(test, class_id, "recall")
            for class_id in (4, 5)
        },
        "global_eligible_before_monthly_absolute_gate": bool(result.global_eligible),
        "global_reasons": list(result.global_reasons),
    }
    (output_dir / "v5_6_4_classification_focus.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, default=str) + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {"v5_6_4_classification_focus": payload},
            ensure_ascii=False,
            default=str,
        ),
        flush=True,
    )


def _write_chart_data(
    regression: pooled.TrainedTask | None,
    classification: pooled.TrainedTask | None,
    config,
) -> None:
    output_dir = Path(config.artifact_directory)
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / "v5_6_4_chart_data.json"
    existing: dict[str, Any] = {}
    if path.exists():
        try:
            existing = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            existing = {}
    if regression is not None:
        existing["regression_skill_by_province"] = [
            {
                "province_id": province_id,
                "skill_percent": float(metrics["skill_vs_persistence"]) * 100.0,
                "eligible": bool(metrics["eligible"]),
            }
            for province_id, metrics in sorted(regression.province_metrics.items())
        ]
        existing["regression_mae_by_horizon"] = [
            {"horizon": int(horizon), "mae": float(metrics["mae"])}
            for horizon, metrics in sorted(
                regression.test_metrics.get("by_horizon", {}).items(),
                key=lambda item: int(item[0]),
            )
        ]
    if classification is not None:
        existing["classification_by_class"] = [
            {
                "class_id": int(class_id),
                "precision": float(
                    classification.test_metrics["per_class"][str(class_id)][
                        "precision"
                    ]
                ),
                "recall": float(
                    classification.test_metrics["per_class"][str(class_id)]["recall"]
                ),
                "f1": float(
                    classification.test_metrics["per_class"][str(class_id)]["f1"]
                ),
            }
            for class_id in CLASS_IDS
        ]
        existing["classification_confusion_matrix"] = classification.test_metrics.get(
            "confusion_matrix"
        )
    existing["trainer_revision"] = TUNING_REVISION
    path.write_text(
        json.dumps(existing, ensure_ascii=False, indent=2, default=str) + "\n",
        encoding="utf-8",
    )


def train_classification_v5_6_4(
    split: pooled.PooledSplit,
    config,
    *args,
    **kwargs,
) -> pooled.TrainedTask:
    """Tune Class 2-3 focus without sacrificing critical Class 4-5 recall."""
    baseline = pooled.train_classification(split, config, *args, **kwargs)
    baseline_cv = baseline.validation_metrics.get("rolling_cv", baseline.validation_metrics)
    baseline_mid = _mid_f1(baseline_cv)

    evaluated: list[dict[str, Any]] = []
    for candidate in CLASSIFICATION_CANDIDATES:
        evaluated.append(_evaluate_rf_candidate_cv(split, config, candidate))

    guarded = [
        item
        for item in evaluated
        if _classification_candidate_passes_cv_guard(item["metrics"], baseline_cv)
        and item["mid_f1"] >= baseline_mid + CLASSIFICATION_MIN_MID_F1_GAIN
    ]
    if guarded:
        selected = max(
            guarded,
            key=lambda item: (
                item["mid_f1"],
                item["metrics"]["macro_f1"],
                item["metrics"]["balanced_accuracy"],
                min(
                    _class_metric(item["metrics"], class_id, "recall")
                    for class_id in (4, 5)
                ),
            ),
        )
        tuned = _build_tuned_classification_task(
            baseline, split, config, selected, selected["metrics"]
        )
        result = tuned if tuned is not None else baseline
    else:
        result = baseline

    result.parameters.setdefault("v5_6_4_candidate_audit", {})
    result.parameters["v5_6_4_candidate_audit"] = {
        "revision": TUNING_REVISION,
        "baseline_profile": "reviewed_balanced_subsample",
        "baseline_cv_mid_f1": baseline_mid,
        "baseline_cv_macro_f1": baseline_cv.get("macro_f1"),
        "baseline_cv_balanced_accuracy": baseline_cv.get("balanced_accuracy"),
        "baseline_cv_critical_recall": {
            str(class_id): _class_metric(baseline_cv, class_id, "recall")
            for class_id in (4, 5)
        },
        "candidates": [
            {
                "profile": item["profile"],
                "mid_f1": item["mid_f1"],
                "macro_f1": item["metrics"]["macro_f1"],
                "balanced_accuracy": item["metrics"]["balanced_accuracy"],
                "class_4_recall": _class_metric(item["metrics"], 4, "recall"),
                "class_5_recall": _class_metric(item["metrics"], 5, "recall"),
                "passed_cv_guard": _classification_candidate_passes_cv_guard(
                    item["metrics"], baseline_cv
                ),
            }
            for item in evaluated
        ],
        "selected_profile": result.parameters.get(
            "profile", "reviewed_balanced_subsample"
        ),
    }
    _write_classification_report(result, config)
    _write_chart_data(None, result, config)
    return result


def install_into_monthly_retrainer() -> None:
    """Install the reviewed v5.6.4 batch tuning into the canonical monthly path."""
    import training.monthly_auto_retrain as monthly

    monthly.train_regression = train_regression_v5_6_4
    monthly.train_classification = train_classification_v5_6_4
