#!/usr/bin/env python3
"""Monthly champion/challenger retraining with fail-closed atomic promotion.

The scheduled path trains a fresh residual LightGBM + pooled Random Forest
challenger from a read-only Open-Meteo archive plus the trusted Supabase daily
continuation. The currently active Production run is evaluated on the exact
same latest 365-day D+1 holdout as the challenger. Production changes only
when the challenger passes its own deployment gates, is non-inferior on both
tasks, and materially improves at least one task.
"""
from __future__ import annotations

import argparse
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from api.ml.forecast import load_active_task_models, load_runtime_artifact
from api.ml.portable_trees import (
    evaluate_lightgbm_regressor,
    evaluate_random_forest_classifier,
)
from training.dual_model_config import (
    POOLED_EMBARGO_DAYS,
    POOLED_FEATURE_COLUMNS,
    POOLED_FEATURE_PROVENANCE,
    POOLED_FEATURE_VERSION,
    POOLED_MINIMUM_ORIGIN_DAYS,
    POOLED_PROVINCE_IDS,
    POOLED_TEST_DAYS,
    POOLED_VALIDATION_DAYS,
    PipelineConfig,
)
from training.monthly_archive import (
    fetch_archive_daily,
    rebuild_leakage_safe_daily_features,
)
from training.pm25_classes import CLASS_IDS
from training.promotion_policy import POLICY_VERSION, decide_promotion
from training.supabase_large_artifact_upload import (
    make_free_plan_upload_and_register,
)
from training.train_dual_models import (
    _json_safe,
    classification_metrics,
    fetch_observed_rows,
    filter_training_rows,
    regression_metrics,
)
from training.train_pooled_models import (
    DIRECT_HORIZONS,
    PooledResult,
    build_pooled_examples,
    build_registry_rows,
    fetch_province_metadata,
    get_client,
    pooled_chronological_split,
    save_artifacts,
    train_classification,
    train_regression,
    upload_and_register,
)

ARCHIVE_START_DATE = "2022-08-01"
ALLOWED_SOURCES = {"open-meteo"}
REQUIRED_PROVINCES = 20
CLASSIFICATION_DEPLOYMENT_THRESHOLDS = {
    "validation_macro_f1": 0.45,
    "validation_balanced_accuracy": 0.45,
    "test_accuracy": 0.65,
    "test_macro_f1": 0.50,
    "test_balanced_accuracy": 0.50,
    "test_weighted_f1": 0.60,
    "critical_recall": 0.35,
    "critical_support": 5,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--artifact-dir",
        type=Path,
        default=Path("training/artifacts"),
    )
    parser.add_argument(
        "--archive-cache-dir",
        type=Path,
        default=Path("training/.cache/open-meteo-monthly"),
    )
    parser.add_argument("--archive-start-date", default=ARCHIVE_START_DATE)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="train/compare but never write Registry/Storage",
    )
    return parser.parse_args()


def _classification_deployment_gate(classification, split) -> dict:
    thresholds = CLASSIFICATION_DEPLOYMENT_THRESHOLDS
    validation = classification.validation_metrics
    test = classification.test_metrics
    reasons: list[str] = []
    checks = (
        (
            "validation_macro_f1",
            validation["macro_f1"],
            thresholds["validation_macro_f1"],
        ),
        (
            "validation_balanced_accuracy",
            validation["balanced_accuracy"],
            thresholds["validation_balanced_accuracy"],
        ),
        ("test_accuracy", test["accuracy"], thresholds["test_accuracy"]),
        ("test_macro_f1", test["macro_f1"], thresholds["test_macro_f1"]),
        (
            "test_balanced_accuracy",
            test["balanced_accuracy"],
            thresholds["test_balanced_accuracy"],
        ),
        (
            "test_weighted_f1",
            test["weighted_f1"],
            thresholds["test_weighted_f1"],
        ),
    )
    for name, value, minimum in checks:
        if not np.isfinite(value) or float(value) < minimum:
            reasons.append(
                f"{name}:{float(value):.6f}<{minimum:.6f}"
            )
    for class_id in (4, 5):
        evidence = test["per_class"][str(class_id)]
        if int(evidence["support"]) < thresholds["critical_support"]:
            reasons.append(
                f"class_{class_id}_support:{evidence['support']}<"
                f"{thresholds['critical_support']}"
            )
        if float(evidence["recall"]) < thresholds["critical_recall"]:
            reasons.append(
                f"class_{class_id}_recall:{float(evidence['recall']):.6f}<"
                f"{thresholds['critical_recall']:.6f}"
            )
    if test.get("metric_class_contract") != list(CLASS_IDS):
        reasons.append("metric_class_contract_mismatch")
    if int(test["test_rows"]) < REQUIRED_PROVINCES * POOLED_TEST_DAYS:
        reasons.append("pooled_test_rows_incomplete")
    if int(split.validation["date"].nunique()) != POOLED_VALIDATION_DAYS:
        reasons.append("validation_origin_dates_not_365")
    if int(split.test["date"].nunique()) != POOLED_TEST_DAYS:
        reasons.append("test_origin_dates_not_365")
    if len(split.dropped_embargo_dates) != 2 * POOLED_EMBARGO_DAYS:
        reasons.append("embargo_dates_not_14")

    training_gate_eligible = bool(classification.global_eligible)
    training_gate_reasons = list(classification.global_reasons)
    deployment_eligible = not reasons
    classification.global_eligible = deployment_eligible
    classification.global_reasons = (
        ["eligible_under_pooled_deployment_policy"]
        if deployment_eligible
        else reasons
    )
    for metrics in classification.province_metrics.values():
        metrics["training_gate_eligible"] = bool(metrics.get("eligible"))
        metrics["deployment_policy"] = "pooled_range_classification_v1"
        metrics["eligible"] = bool(
            deployment_eligible
            and int(metrics.get("test_rows", 0)) >= POOLED_TEST_DAYS
        )
        metrics["local_eligible"] = metrics["eligible"]
    return {
        "eligible": deployment_eligible,
        "reasons": classification.global_reasons,
        "thresholds": thresholds,
        "training_gate_eligible": training_gate_eligible,
        "training_gate_reasons": training_gate_reasons,
    }


def _prepare_training_data(
    sb,
    cache_dir: Path,
    archive_start_date: str,
):
    province_ids = tuple(POOLED_PROVINCE_IDS)
    metadata = fetch_province_metadata(sb, province_ids)
    raw_database = fetch_observed_rows(sb, province_ids)
    database = filter_training_rows(raw_database, ALLOWED_SOURCES).copy()
    if database.empty:
        raise RuntimeError("trusted database continuation is empty")
    database["date"] = pd.to_datetime(database["date"]).dt.normalize()
    database["data_origin"] = "supabase-training-daily-summary-v2"
    database_first_date = pd.Timestamp(database["date"].min()).normalize()
    archive_start = pd.Timestamp(archive_start_date).normalize()
    archive_end = database_first_date - pd.Timedelta(days=1)
    archive = pd.DataFrame()
    if archive_start <= archive_end:
        archive = fetch_archive_daily(
            metadata,
            archive_start,
            archive_end,
            cache_directory=cache_dir,
        )
    combined = pd.concat(
        [archive, database],
        ignore_index=True,
        sort=False,
    )
    observed = rebuild_leakage_safe_daily_features(combined, metadata)
    counts = observed.groupby("province_id")["date"].nunique().to_dict()
    missing = [
        province_id
        for province_id in province_ids
        if counts.get(province_id, 0) < POOLED_MINIMUM_ORIGIN_DAYS
    ]
    if missing:
        raise RuntimeError(
            f"multi-season training history is incomplete: {missing}"
        )
    audit = {
        "archive_start_date": archive_start.date().isoformat(),
        "archive_end_date": archive_end.date().isoformat(),
        "database_first_date": database_first_date.date().isoformat(),
        "database_last_date": pd.Timestamp(database["date"].max())
        .date()
        .isoformat(),
        "database_writes": 0,
        "database_overlap_policy": (
            "database rows win from the first trusted database date"
        ),
        "archive_air_source": (
            "Open-Meteo CAMS global model-derived PM2.5"
        ),
        "archive_weather_source": "Open-Meteo Historical Weather API",
        "archive_cache_directory": str(cache_dir),
        "usable_days_by_province": counts,
    }
    return observed, metadata, audit


def _regression_baseline(rows: pd.DataFrame) -> tuple[np.ndarray, dict]:
    truth = rows["target_pm25"].to_numpy(dtype=float)
    prediction = rows["pm25_mean"].to_numpy(dtype=float)
    return prediction, regression_metrics(truth, prediction)


def _evaluate_active_champion(sb, split) -> dict:
    active = load_active_task_models(sb)
    if set(active) != {"regression", "classification"}:
        raise RuntimeError("active dual-model task set is incomplete")
    if (
        len(active["regression"]) != REQUIRED_PROVINCES
        or len(active["classification"]) != REQUIRED_PROVINCES
    ):
        raise RuntimeError(
            "Production does not have exactly 20 active rows for each task"
        )
    active_run_ids = {
        str(row.get("run_id"))
        for task_rows in active.values()
        for row in task_rows.values()
    }
    if len(active_run_ids) != 1:
        raise RuntimeError(
            "active Regression/Classification rows do not share one run: "
            f"{active_run_ids}"
        )
    if any(
        row.get("feature_version") != POOLED_FEATURE_VERSION
        for task_rows in active.values()
        for row in task_rows.values()
    ):
        raise RuntimeError(
            "active model feature version differs from the monthly challenger"
        )

    d1 = split.test[
        split.test["forecast_horizon_days"] == 1
    ].copy()
    runtime_cache: dict[str, dict] = {}
    regression_predictions = np.full(len(d1), np.nan, dtype=float)
    province_metrics: dict[str, dict] = {}
    for province_id in POOLED_PROVINCE_IDS:
        mask = d1["province_id"].to_numpy() == province_id
        rows = d1.loc[mask]
        row = active["regression"][province_id]
        artifact = load_runtime_artifact(sb, row, runtime_cache)
        if artifact is None:
            raise RuntimeError(
                f"active regression runtime unavailable for {province_id}"
            )
        X = rows.loc[:, POOLED_FEATURE_COLUMNS].to_numpy(dtype=float)
        predictions = np.asarray(
            [
                evaluate_lightgbm_regressor(vector, artifact)
                for vector in X
            ],
            dtype=float,
        )
        regression_predictions[mask] = predictions
        local = regression_metrics(
            rows["target_pm25"].to_numpy(dtype=float),
            predictions,
        )
        _, baseline = _regression_baseline(rows)
        local["skill_vs_persistence"] = (
            1.0 - local["mae"] / baseline["mae"]
        )
        province_metrics[province_id] = local
    if not np.all(np.isfinite(regression_predictions)):
        raise RuntimeError(
            "active regression evaluation produced incomplete predictions"
        )
    regression = regression_metrics(
        d1["target_pm25"].to_numpy(dtype=float),
        regression_predictions,
    )
    _, baseline = _regression_baseline(d1)
    regression["skill_vs_persistence"] = (
        1.0 - regression["mae"] / baseline["mae"]
    )

    classifier_rows = list(active["classification"].values())
    runtime_keys = {
        (
            row.get("runtime_artifact_uri"),
            row.get("runtime_artifact_sha256"),
        )
        for row in classifier_rows
    }
    if len(runtime_keys) != 1:
        raise RuntimeError(
            "active pooled classifier rows do not reference one runtime"
        )
    classifier_artifact = load_runtime_artifact(
        sb,
        classifier_rows[0],
        runtime_cache,
    )
    if classifier_artifact is None:
        raise RuntimeError("active classifier runtime unavailable")
    X_classifier = d1.loc[:, POOLED_FEATURE_COLUMNS].to_numpy(dtype=float)
    probability_rows = [
        evaluate_random_forest_classifier(
            vector,
            classifier_artifact,
            class_ids=CLASS_IDS,
        )
        for vector in X_classifier
    ]
    probabilities = np.asarray(
        [
            [row[str(class_id)] for class_id in CLASS_IDS]
            for row in probability_rows
        ],
        dtype=float,
    )
    predictions = np.asarray(CLASS_IDS)[
        np.argmax(probabilities, axis=1)
    ]
    classification = classification_metrics(
        d1["target_air_quality_class"].to_numpy(dtype=int),
        predictions,
        probabilities,
    )
    return {
        "run_id": next(iter(active_run_ids)),
        "regression": regression,
        "regression_by_province": province_metrics,
        "classification": classification,
    }


def _candidate_ready(regression, classification) -> bool:
    return bool(
        regression.global_eligible
        and len(regression.province_metrics) == REQUIRED_PROVINCES
        and all(
            bool(metrics.get("eligible"))
            for metrics in regression.province_metrics.values()
        )
        and classification.global_eligible
        and len(classification.province_metrics) == REQUIRED_PROVINCES
        and all(
            bool(metrics.get("eligible"))
            for metrics in classification.province_metrics.values()
        )
    )


def main() -> int:
    args = parse_args()
    args.artifact_dir.mkdir(parents=True, exist_ok=True)
    args.archive_cache_dir.mkdir(parents=True, exist_ok=True)
    config = PipelineConfig(
        minimum_rows=POOLED_MINIMUM_ORIGIN_DAYS,
        minimum_validation_rows=POOLED_VALIDATION_DAYS,
        minimum_test_rows=POOLED_TEST_DAYS,
        cv_splits=5,
        regression_minimum_skill=0.045,
        classifier_minimum_macro_f1=0.50,
        classifier_minimum_critical_recall=0.35,
        critical_class_minimum_support=5,
        artifact_directory=args.artifact_dir,
    )
    config.validate()
    sb = get_client()
    observed, metadata, archive_audit = _prepare_training_data(
        sb,
        args.archive_cache_dir,
        args.archive_start_date,
    )
    examples = build_pooled_examples(observed, metadata)
    split = pooled_chronological_split(examples, config)
    print(
        {
            "monthly_retrain": "fresh",
            "train_origin_dates": int(split.train["date"].nunique()),
            "validation_origin_dates": int(
                split.validation["date"].nunique()
            ),
            "test_origin_dates": int(split.test["date"].nunique()),
            "test_end": str(pd.Timestamp(split.test["date"].max()).date()),
        }
    )

    regression = train_regression(split, config)
    classification = train_classification(split, config)
    classification_policy = _classification_deployment_gate(
        classification,
        split,
    )
    candidate_ready = _candidate_ready(regression, classification)

    champion = _evaluate_active_champion(sb, split)
    decision = decide_promotion(
        candidate_regression=regression.test_metrics,
        champion_regression=champion["regression"],
        candidate_classification=classification.test_metrics,
        champion_classification=champion["classification"],
        candidate_regression_provinces=regression.province_metrics,
        champion_regression_provinces=champion[
            "regression_by_province"
        ],
        candidate_ready=candidate_ready,
        required_provinces=REQUIRED_PROVINCES,
    )

    run_id = str(uuid.uuid4())
    audit = {
        "strategy": "monthly_fresh_champion_challenger",
        "promotion_policy": POLICY_VERSION,
        "pool_provinces": list(POOLED_PROVINCE_IDS),
        "feature_version": POOLED_FEATURE_VERSION,
        "feature_provenance": POOLED_FEATURE_PROVENANCE,
        "target_source": (
            "Open-Meteo archive plus trusted database continuation"
        ),
        "target_horizons": list(DIRECT_HORIZONS),
        "validated_classification_horizons": [1],
        "same_date_same_partition": True,
        "embargo_days": POOLED_EMBARGO_DAYS,
        "dropped_embargo_dates": split.dropped_embargo_dates,
        "archive": archive_audit,
        "classification_deployment_policy": classification_policy,
        "regression_auto_promotion_requires_strict_20_of_20": True,
        "current_champion_run_id": champion["run_id"],
        "same_holdout_champion_evaluation": True,
        "monthly_challenger_window_used_for_production_selection": True,
        "research_reporting_note": (
            "Monthly challenger windows are operational promotion evidence "
            "and do not replace the frozen final-test result reported for "
            "the capstone model run."
        ),
    }
    registry_rows = build_registry_rows(
        run_id,
        tuple(POOLED_PROVINCE_IDS),
        split,
        regression,
        classification,
        audit,
    )
    result = PooledResult(
        run_id,
        tuple(POOLED_PROVINCE_IDS),
        split,
        regression,
        classification,
        registry_rows,
        audit,
    )

    promoted = False
    activation_status = "not_requested"
    if decision["approved"] and not args.dry_run:
        artifacts = save_artifacts(result, args.artifact_dir, config)
        free_plan_upload = make_free_plan_upload_and_register(
            upload_and_register
        )
        free_plan_upload(
            sb,
            result,
            artifacts,
            activate=True,
        )
        active_after = (
            sb.table("model_registry")
            .select("province_id,task_type,run_id,is_active")
            .eq("run_id", run_id)
            .eq("is_active", True)
            .execute()
            .data
            or []
        )
        if len(active_after) != REQUIRED_PROVINCES * 2:
            raise RuntimeError(
                "atomic activation readback expected 40 rows, found "
                f"{len(active_after)}"
            )
        promoted = True
        activation_status = "activated"
    elif decision["approved"]:
        activation_status = "dry_run_would_activate"
    else:
        activation_status = "kept_current_champion"

    summary = {
        "run_id": run_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "dry_run": bool(args.dry_run),
        "promoted": promoted,
        "activation_status": activation_status,
        "candidate_ready": candidate_ready,
        "champion_run_id": champion["run_id"],
        "candidate": {
            "regression": regression.test_metrics,
            "classification": classification.test_metrics,
        },
        "champion_on_same_holdout": {
            "regression": champion["regression"],
            "classification": champion["classification"],
        },
        "promotion": decision,
        "audit": audit,
    }
    run_dir = args.artifact_dir / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    summary_path = run_dir / "run_summary.json"
    summary_path.write_text(
        json.dumps(
            _json_safe(summary),
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    promotion_path = args.artifact_dir / "monthly_promotion.json"
    promotion_path.write_text(
        json.dumps(
            _json_safe(summary),
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(json.dumps(_json_safe(summary), ensure_ascii=False))
    print(f"PROMOTED={'true' if promoted else 'false'}")
    print(f"MONTHLY_PROMOTION={promotion_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
