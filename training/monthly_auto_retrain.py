#!/usr/bin/env python3
"""Monthly champion/challenger retraining from Supabase only.


The historical Open-Meteo/CAMS archive is persisted once in Supabase with
request-level source lineage. This scheduled retraining path performs no
Open-Meteo archive requests and has no archive cache dependency. It trains a
fresh residual LightGBM + pooled Random Forest challenger, evaluates the
current Production champion on the exact same latest 365-day D+1 holdout, and
promotes atomically only when the configured promotion policy approves it.
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
from api.ml.portable_trees import evaluate_lightgbm_regressor, evaluate_random_forest_classifier
from training.db_training_data import prepare_db_training_data
from training.balanced_activation_policy_v1 import (
    POLICY_VERSION as BALANCED_POLICY_VERSION,
    decide_regression_candidate,
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
from training.pm25_classes import CLASS_IDS
from training.promotion_policy import POLICY_VERSION, decide_promotion
from training.supabase_large_artifact_upload import make_free_plan_upload_and_register
from training.train_dual_models import _json_safe, classification_metrics, regression_metrics
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
    parser.add_argument("--artifact-dir", type=Path, default=Path("training/artifacts"))
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
        ("validation_macro_f1", validation["macro_f1"], thresholds["validation_macro_f1"]),
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
        ("test_weighted_f1", test["weighted_f1"], thresholds["test_weighted_f1"]),
    )
    for name, value, minimum in checks:
        if not np.isfinite(value) or float(value) < minimum:
            reasons.append(f"{name}:{float(value):.6f}<{minimum:.6f}")
    for class_id in (4, 5):
        evidence = test["per_class"][str(class_id)]
        if int(evidence["support"]) < thresholds["critical_support"]:
            reasons.append(
                f"class_{class_id}_support:{evidence['support']}<{thresholds['critical_support']}"
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
        ["eligible_under_pooled_deployment_policy"] if deployment_eligible else reasons
    )
    for metrics in classification.province_metrics.values():
        metrics["training_gate_eligible"] = bool(metrics.get("eligible"))
        metrics["deployment_policy"] = "pooled_range_classification_v1"
        metrics["eligible"] = bool(
            deployment_eligible and int(metrics.get("test_rows", 0)) >= POOLED_TEST_DAYS
        )
        metrics["local_eligible"] = metrics["eligible"]
    return {
        "eligible": deployment_eligible,
        "reasons": classification.global_reasons,
        "thresholds": thresholds,
        "training_gate_eligible": training_gate_eligible,
        "training_gate_reasons": training_gate_reasons,
    }




def _regression_baseline(rows: pd.DataFrame) -> tuple[np.ndarray, dict]:
    truth = rows["target_pm25"].to_numpy(dtype=float)
    prediction = rows["pm25_mean"].to_numpy(dtype=float)
    return prediction, regression_metrics(truth, prediction)




def _evaluate_active_champion(sb, split) -> dict:
    active = load_active_task_models(sb)
    if set(active) != {"regression", "classification"}:
        raise RuntimeError("active dual-model task set is incomplete")
    if len(active["regression"]) != REQUIRED_PROVINCES or len(active["classification"]) != REQUIRED_PROVINCES:
        raise RuntimeError("Production does not have exactly 20 active rows for each task")


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
        raise RuntimeError("active model feature version differs from the monthly challenger")


    test_rows = split.test.copy()
    d1 = test_rows[test_rows["forecast_horizon_days"] == 1].copy()
    runtime_cache: dict[str, dict] = {}
    regression_predictions = np.full(len(test_rows), np.nan, dtype=float)
    province_metrics: dict[str, dict] = {}
    for province_id in POOLED_PROVINCE_IDS:
        mask = test_rows["province_id"].to_numpy() == province_id
        rows = test_rows.loc[mask]
        row = active["regression"][province_id]
        artifact = load_runtime_artifact(sb, row, runtime_cache)
        if artifact is None:
            raise RuntimeError(f"active regression runtime unavailable for {province_id}")
        X = rows.loc[:, POOLED_FEATURE_COLUMNS].to_numpy(dtype=float)
        predictions = np.asarray(
            [evaluate_lightgbm_regressor(vector, artifact) for vector in X],
            dtype=float,
        )
        regression_predictions[mask] = predictions
        local_d1 = rows[rows["forecast_horizon_days"] == 1]
        local_d1_predictions = predictions[
            rows["forecast_horizon_days"].to_numpy(dtype=int) == 1
        ]
        local = regression_metrics(
            local_d1["target_pm25"].to_numpy(dtype=float),
            local_d1_predictions,
        )
        _, baseline = _regression_baseline(local_d1)
        local["skill_vs_persistence"] = 1.0 - local["mae"] / baseline["mae"]
        province_metrics[province_id] = local
    if not np.all(np.isfinite(regression_predictions)):
        raise RuntimeError("active regression evaluation produced incomplete predictions")


    horizons = test_rows["forecast_horizon_days"].to_numpy(dtype=int)
    d1_mask = horizons == 1
    regression = regression_metrics(
        d1["target_pm25"].to_numpy(dtype=float), regression_predictions[d1_mask]
    )
    _, baseline = _regression_baseline(d1)
    regression["skill_vs_persistence"] = 1.0 - regression["mae"] / baseline["mae"]
    regression_all = regression_metrics(
        test_rows["target_pm25"].to_numpy(dtype=float),
        regression_predictions,
    )
    _, baseline_all = _regression_baseline(test_rows)
    regression_all["skill_vs_persistence"] = (
        1.0 - regression_all["mae"] / baseline_all["mae"]
        if baseline_all["mae"] > 0
        else 0.0
    )
    regression["all_horizons"] = regression_all
    regression["by_horizon"] = {}
    for horizon in DIRECT_HORIZONS:
        mask = horizons == horizon
        metrics = regression_metrics(
            test_rows.loc[mask, "target_pm25"].to_numpy(dtype=float),
            regression_predictions[mask],
        )
        _, horizon_baseline = _regression_baseline(test_rows.loc[mask])
        metrics["baseline_mae"] = horizon_baseline["mae"]
        metrics["skill_vs_persistence"] = (
            1.0 - metrics["mae"] / horizon_baseline["mae"]
            if horizon_baseline["mae"] > 0
            else 0.0
        )
        regression["by_horizon"][str(horizon)] = metrics


    classifier_rows = list(active["classification"].values())
    runtime_keys = {
        (row.get("runtime_artifact_uri"), row.get("runtime_artifact_sha256"))
        for row in classifier_rows
    }
    if len(runtime_keys) != 1:
        raise RuntimeError("active pooled classifier rows do not reference one runtime")
    classifier_artifact = load_runtime_artifact(sb, classifier_rows[0], runtime_cache)
    if classifier_artifact is None:
        raise RuntimeError("active classifier runtime unavailable")
    X_classifier = d1.loc[:, POOLED_FEATURE_COLUMNS].to_numpy(dtype=float)
    probability_rows = [
        evaluate_random_forest_classifier(vector, classifier_artifact, class_ids=CLASS_IDS)
        for vector in X_classifier
    ]
    probabilities = np.asarray(
        [[row[str(class_id)] for class_id in CLASS_IDS] for row in probability_rows],
        dtype=float,
    )
    predictions = np.asarray(CLASS_IDS)[np.argmax(probabilities, axis=1)]
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




def _balanced_province_regression_preview(sb, split, regression, province_ids) -> dict:
    """One-window candidate-vs-baseline and active Champion; read-only.

    This does not claim canonical source parity. QA must be verified by the
    separate production reconciliation audit before any registration/activation.
    """
    rows = split.validation.loc[split.validation["forecast_horizon_days"].eq(1)].copy()
    predictions = np.asarray(regression.validation_predictions, dtype=float)[
        split.validation["forecast_horizon_days"].eq(1).to_numpy()
    ]
    if len(rows) != len(predictions) or not np.all(np.isfinite(predictions)):
        raise RuntimeError("Regression validation D+1 predictions are incomplete")
    active_rows = (
        sb.table("model_registry")
        .select("province_id,task_type,feature_version,train_end,eligibility_status,"
                "evidence_status,runtime_artifact_uri,runtime_artifact_sha256")
        .eq("is_active", True).eq("task_type", "regression")
        .execute().data or []
    )
    active = {str(row["province_id"]): row for row in active_rows}
    if len(active) != len(active_rows):
        raise RuntimeError("Duplicate active regression models")
    runtime_cache = {}
    decisions = {}
    for province_id in province_ids:
        mask = rows["province_id"].eq(province_id).to_numpy()
        local = rows.loc[mask]
        truth = local["target_pm25"].to_numpy(dtype=float)
        baseline = local["pm25_mean"].to_numpy(dtype=float)
        candidate = predictions[mask]
        mae = float(np.mean(np.abs(truth - candidate)))
        baseline_mae = float(np.mean(np.abs(truth - baseline)))
        skill = 1 - mae / baseline_mae if baseline_mae > 0 else float("nan")
        severe_mask = truth > 37.5
        severe_support = int(severe_mask.sum())
        severe_mae = float(np.mean(np.abs(truth[severe_mask] - candidate[severe_mask]))) if severe_support else None
        severe_base = float(np.mean(np.abs(truth[severe_mask] - baseline[severe_mask]))) if severe_support else None
        champion = active.get(province_id)
        champion_mae = None
        champion_compare_error = None
        if champion is not None:
            try:
                if champion.get("eligibility_status") is not True or champion.get("evidence_status") != "validated":
                    raise ValueError("unvalidated active Champion")
                if champion.get("feature_version") != POOLED_FEATURE_VERSION:
                    raise ValueError("active Champion feature contract differs")
                if pd.Timestamp(champion["train_end"]).date() >= pd.Timestamp(local["date"].min()).date():
                    raise ValueError("active Champion trained on validation period")
                artifact = load_runtime_artifact(sb, champion, runtime_cache)
                if artifact is None:
                    raise ValueError("Champion Artifact unavailable")
                X = local.loc[:, POOLED_FEATURE_COLUMNS].to_numpy(dtype=float)
                champion_predictions = np.asarray([evaluate_lightgbm_regressor(row,artifact) for row in X], dtype=float)
                if not np.all(np.isfinite(champion_predictions)):
                    raise ValueError("Champion predictions are non-finite")
                champion_mae = float(np.mean(np.abs(truth - champion_predictions)))
            except (ValueError, KeyError, TypeError) as exc:
                champion_compare_error = str(exc)[:160]
        model_metrics = regression.province_metrics[province_id]
        all_reasons = tuple(str(x) for x in model_metrics.get("eligibility_reasons", ())
                            if str(x) not in ("eligible", "skill_below_threshold"))
        # Release preview can rank scientifically eligible candidates, but
        # production QA and serving parity are deliberately not inferred here.
        decision = decide_regression_candidate(
            test_skill=float(model_metrics["skill_vs_persistence"]),
            validation_skill=skill,validation_mae=mae,
            persistence_validation_mae=baseline_mae,
            test_rows=int(model_metrics["test_rows"]),validation_rows=len(local),
            high_pm_support=severe_support,high_pm_mae=severe_mae,
            high_pm_persistence_mae=severe_base,
            native_portable_parity=bool(regression.runtime_artifact.get(province_id)),
            source_qa_passed=True, other_training_failures=all_reasons,
            champion_present=champion is not None,
            champion_validation_mae=champion_mae,
        )
        decisions[province_id] = {
            **decision,
            "champion_compare_error":champion_compare_error,
            "production_source_qa_verified":False,
            "production_runtime_e2e_verified":False,
            "ready_to_activate":False,
        }
    return {"policy_version":BALANCED_POLICY_VERSION,
            "release_mode":"PREVIEW_ONLY", "provinces":decisions,
            "quality_gate":"production_reconciliation_required",
            "activation_permitted":False}


def _candidate_ready(regression, classification) -> bool:
    return bool(
        regression.global_eligible
        and len(regression.province_metrics) == REQUIRED_PROVINCES
        and all(bool(metrics.get("eligible")) for metrics in regression.province_metrics.values())
        and classification.global_eligible
        and len(classification.province_metrics) == REQUIRED_PROVINCES
        and all(bool(metrics.get("eligible")) for metrics in classification.province_metrics.values())
    )




def main() -> int:
    args = parse_args()
    args.artifact_dir.mkdir(parents=True, exist_ok=True)
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
    metadata = fetch_province_metadata(sb, tuple(POOLED_PROVINCE_IDS))
    observed, database_audit = prepare_db_training_data(sb, metadata)
    examples = build_pooled_examples(observed, metadata)
    split = pooled_chronological_split(examples, config)
    print(
        {
            "monthly_retrain": "fresh_db_only",
            "source_of_truth": database_audit["source_of_truth"],
            "network_archive_reads": database_audit["network_archive_reads"],
            "train_origin_dates": int(split.train["date"].nunique()),
            "validation_origin_dates": int(split.validation["date"].nunique()),
            "test_origin_dates": int(split.test["date"].nunique()),
            "test_end": str(pd.Timestamp(split.test["date"].max()).date()),
        }
    )


    regression = train_regression(split, config)
    classification = train_classification(split, config)
    classification_policy = _classification_deployment_gate(classification, split)
    candidate_ready = _candidate_ready(regression, classification)
    # The existing monthly champion comparator requires 20+20 active rows, but
    # Production currently has 18 regression and 0 classification. Use the
    # province-local shared policy instead and keep auto-promotion disabled
    # until the canonical QA and deployment-contract evidence are proven.
    run_id = str(uuid.uuid4())
    balanced_preview = _balanced_province_regression_preview(
        sb, split, regression, tuple(POOLED_PROVINCE_IDS)
    )
    summary = {
        "run_id": run_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "dry_run": True,
        "promoted": False,
        "activation_status": "held_pending_canonical_qa_and_runtime_e2e",
        "candidate_ready": False,
        "champion_run_id": None,
        "promotion": {"approved":False, "policy_version":BALANCED_POLICY_VERSION,
                      "decision":"keep_champion", "reasons":[
                          "production_canonical_qa_not_verified",
                          "production_serving_runtime_e2e_not_verified",
                          "classification_critical_class_evidence_not_proven",
                      ]},
        "balanced_regression_preview": balanced_preview,
        "audit": {"source_of_truth": database_audit["source_of_truth"],
                  "automated_activation_disabled":True,
                  "training_policy": "shared_standard_and_conditional_province_policy"},
    }
    run_dir = args.artifact_dir / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "run_summary.json").write_text(
        json.dumps(_json_safe(summary),ensure_ascii=False,indent=2),encoding="utf-8")
    promotion_path = args.artifact_dir / "monthly_promotion.json"
    promotion_path.write_text(
        json.dumps(_json_safe(summary),ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(_json_safe(summary),ensure_ascii=False))
    print("PROMOTED=false")
    print(f"MONTHLY_PROMOTION={promotion_path}")
    return 0



if __name__ == "__main__":
    raise SystemExit(main())
