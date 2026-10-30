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
from training.selective_activation import build_selective_activation_plan
from training.v5_7_5_activation_contract import (
    apply_activation_plan, preflight_activation_plan, rollback_activation,
)
from api.ml.forecast import make_forecasts
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
    """Evaluate any existing active models on the SAME operational D+1 holdout.

    Unlike the retired all-or-nothing policy, 18 regression / 0 classifier
    champions is a valid production state. An unverifiable champion is held,
    never silently replaced. No test labels are used to train a model here.
    """
    active = load_active_task_models(sb)
    if set(active) != {"regression", "classification"}:
        raise RuntimeError("unexpected active task response shape")
    d1 = split.test.loc[split.test["forecast_horizon_days"] == 1].copy()
    scores: dict[str, dict[str, dict]] = {"regression": {}, "classification": {}}
    cache: dict[str, dict] = {}
    for task in ("regression", "classification"):
        for province_id, row in active[task].items():
            # Without a comparable feature contract the incumbent must be held.
            if row.get("feature_version") != POOLED_FEATURE_VERSION:
                continue
            sample = d1.loc[d1["province_id"] == province_id]
            if len(sample) != POOLED_TEST_DAYS:
                continue
            try:
                artifact = load_runtime_artifact(sb, row, cache)
                if artifact is None:
                    continue
                features = sample.loc[:, POOLED_FEATURE_COLUMNS].to_numpy(dtype=float)
                if task == "regression":
                    predicted = [
                        evaluate_lightgbm_regressor(vector, artifact)
                        for vector in features
                    ]
                    metric = regression_metrics(
                        sample["target_pm25"].to_numpy(dtype=float),
                        np.asarray(predicted, dtype=float),
                    )
                else:
                    probability_rows = [
                        evaluate_random_forest_classifier(
                            vector, artifact, class_ids=CLASS_IDS
                        )
                        for vector in features
                    ]
                    probability = np.asarray(
                        [[p[str(class_id)] for class_id in CLASS_IDS] for p in probability_rows],
                        dtype=float,
                    )
                    predicted = np.asarray(CLASS_IDS)[np.argmax(probability, axis=1)]
                    metric = classification_metrics(
                        sample["target_air_quality_class"].to_numpy(dtype=int),
                        predicted, probability,
                    )
                metric["same_holdout"] = True
                metric["test_rows"] = len(sample)
                scores[task][province_id] = metric
            except (TypeError, ValueError, KeyError, RuntimeError) as error:
                # Cannot prove superiority: keep the previous active model.
                print({"champion_comparison_unavailable": province_id,
                       "task": task, "reason": str(error)[:200]})
    run_ids = sorted({
        str(row.get("run_id")) for group in active.values()
        for row in group.values() if row.get("run_id")
    })
    return {
        "run_id": run_ids[0] if len(run_ids) == 1 else "mixed_or_incomplete",
        "run_ids": run_ids,
        "active": active,
        "scores": scores,
        "comparison_window": {
            "start": str(d1["date"].min().date()),
            "end": str(d1["date"].max().date()),
            "rows": len(d1),
        },
    }


def _localize_regression_eligibility(regression, registry_rows: list[dict]) -> None:
    """Relax ONLY the obsolete 20/20 aggregate gate, never any numeric gate.

    Any non-provincial global failure keeps all candidates ineligible.
    Each province still needs its original local eligibility and strict Skill.
    """
    global_blockers = [
        str(reason) for reason in regression.global_reasons
        if not str(reason).startswith("province_gate_failed:")
        and not str(reason).startswith("warning:")
    ]
    for row in registry_rows:
        if row["task_type"] != "regression":
            continue
        local = regression.province_metrics[row["province_id"]]
        skill = float(local.get("skill_vs_persistence") or 0.0)
        good = (
            not global_blockers
            and bool(local.get("local_eligible", local.get("eligible")))
            and np.isfinite(skill)
            and skill >= 0.045
            and int(row.get("test_rows") or 0) >= POOLED_TEST_DAYS
        )
        row["eligibility_status"] = bool(good)
        row["evidence_status"] = "validated" if good else "ineligible"
        row["eligibility_reason"] = (
            "selective_local_strict_gate_pass"
            if good else "selective_local_or_aggregate_gate_failed"
        )


def _record_promotion_log(sb, *, run_id: str, status: str, meta: dict) -> None:
    """Use the SAME cron_log feed already exposed by /api/system-status."""
    now = datetime.now(timezone.utc).isoformat()
    sb.table("cron_log").insert({
        "job_name": "model_promotion",
        "started_at": now,
        "finished_at": now,
        "status": status,
        "records_in": 40,
        "records_out": int(meta.get("activation_count") or 0),
        "meta": {**meta, "run_id": run_id, "pipeline": "monthly_auto_retrain"},
    }).execute()


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
    champion = _evaluate_active_champion(sb, split)
    run_id = str(uuid.uuid4())
    audit = {
        "strategy": "existing_monthly_pipeline_selective_activation",
        "promotion_policy": POLICY_VERSION,
        "pool_provinces": list(POOLED_PROVINCE_IDS),
        "feature_version": POOLED_FEATURE_VERSION,
        "feature_provenance": POOLED_FEATURE_PROVENANCE,
        "target_source": "Supabase training_daily_summary_v3 only",
        "database_source_of_truth": database_audit,
        "target_horizons": list(DIRECT_HORIZONS),
        "same_date_same_partition": True,
        "embargo_days": POOLED_EMBARGO_DAYS,
        "dropped_embargo_dates": split.dropped_embargo_dates,
        "classification_deployment_policy": classification_policy,
        "per_province_strict_skill_floor": 0.045,
        "partial_bootstrap_supported": True,
        "champion_run_ids": champion["run_ids"],
        "operational_holdout": champion["comparison_window"],
        "research_reporting_note": (
            "Operational selection on the latest D+1 holdout must not be presented "
            "as a previously untouched academic final-test result."
        ),
    }
    registry_rows = build_registry_rows(
        run_id, tuple(POOLED_PROVINCE_IDS), split, regression, classification, audit
    )
    _localize_regression_eligibility(regression, registry_rows)
    if not classification_policy["eligible"]:
        for row in registry_rows:
            if row["task_type"] == "classification":
                row["eligibility_status"] = False
                row["evidence_status"] = "ineligible"
                row["eligibility_reason"] = "global_classification_deployment_gate_failed"
    plan, decision = build_selective_activation_plan(
        POOLED_PROVINCE_IDS, registry_rows, champion["active"], champion["scores"]
    )
    result = PooledResult(
        run_id, tuple(POOLED_PROVINCE_IDS), split, regression, classification,
        registry_rows, audit,
    )
    promoted = False
    activation_status = "dry_run" if args.dry_run else "no_eligible_improvement"
    activation_id = None
    preflight = None
    if decision["activation_count"] and not args.dry_run:
        try:
            artifacts = save_artifacts(result, args.artifact_dir, config)
            free_plan_upload = make_free_plan_upload_and_register(upload_and_register)
            # Registration must NEVER use the old 40/40 activation RPC.
            free_plan_upload(sb, result, artifacts, activate=False)
            preflight = preflight_activation_plan(
                sb, run_id=run_id, plan=plan, required_provinces=REQUIRED_PROVINCES
            )
            applied = apply_activation_plan(
                sb, run_id=run_id, plan=plan, required_provinces=REQUIRED_PROVINCES
            )
            activation_id = applied["activation_id"]
            # Read-only smoke test BEFORE the existing GH forecast job writes.
            preview = make_forecasts(sb, horizon=7)
            if len(preview) != REQUIRED_PROVINCES * 7 or len({
                row["province_id"] for row in preview
            }) != REQUIRED_PROVINCES:
                raise RuntimeError(
                    f"forecast smoke test expected 140 rows/20 provinces, got {len(preview)}"
                )
            promoted = True
            activation_status = "activated"
        except Exception as error:
            activation_status = "activation_failed"
            if activation_id:
                try:
                    rollback_activation(sb, activation_id=str(activation_id))
                    activation_status = "rolled_back_after_smoke_failure"
                except Exception as rollback_error:
                    activation_status = "rollback_failed"
                    print({"rollback_error": str(rollback_error)[:300]})
            try:
                _record_promotion_log(
                    sb, run_id=run_id, status="error",
                    meta={**decision, "activation_status": activation_status,
                          "activation_id": activation_id, "error": str(error)[:300]},
                )
            except Exception as log_error:
                print({"promotion_log_error": str(log_error)[:300]})
            raise
    if not args.dry_run:
        _record_promotion_log(
            sb, run_id=run_id, status="success",
            meta={**decision, "activation_status": activation_status,
                  "activation_id": activation_id, "preflight": preflight},
        )
    summary = {
        "run_id": run_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "dry_run": bool(args.dry_run),
        "promoted": promoted,
        "activation_id": activation_id,
        "activation_status": activation_status,
        "candidate_ready": decision["activation_count"] > 0,
        "champion_run_id": champion["run_id"],
        "candidate": {
            "regression": regression.test_metrics,
            "classification": classification.test_metrics,
        },
        "champion_on_same_holdout": champion["scores"],
        "promotion": decision,
        "activation_plan": plan,
        "preflight": preflight,
        "audit": audit,
    }
    run_dir = args.artifact_dir / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    summary_path = run_dir / "run_summary.json"
    summary_path.write_text(
        json.dumps(_json_safe(summary), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    promotion_path = args.artifact_dir / "monthly_promotion.json"
    promotion_path.write_text(
        json.dumps(_json_safe(summary), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(json.dumps(_json_safe(summary), ensure_ascii=False))
    print(f"PROMOTED={'true' if promoted else 'false'}")
    print(f"MONTHLY_PROMOTION={promotion_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
