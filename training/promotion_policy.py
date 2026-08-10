"""Fail-closed champion/challenger promotion policy for monthly PM2.5 retraining."""
from __future__ import annotations

import math
from collections.abc import Mapping

POLICY_VERSION = "monthly-champion-challenger-v1"


def _number(metrics: Mapping[str, object], key: str) -> float:
    value = float(metrics[key])
    if not math.isfinite(value):
        raise ValueError(f"metric {key} must be finite")
    return value


def _critical_recall(metrics: Mapping[str, object], class_id: int) -> float:
    per_class = metrics.get("per_class")
    if not isinstance(per_class, Mapping):
        raise ValueError("classification metrics are missing per_class")
    evidence = per_class.get(str(class_id))
    if not isinstance(evidence, Mapping):
        raise ValueError(f"classification metrics are missing class {class_id}")
    support = int(evidence.get("support", 0) or 0)
    if support <= 0:
        raise ValueError(f"classification class {class_id} has no support")
    recall = float(evidence["recall"])
    if not math.isfinite(recall):
        raise ValueError(f"classification class {class_id} recall must be finite")
    return recall


def decide_promotion(
    *,
    candidate_regression: Mapping[str, object],
    champion_regression: Mapping[str, object],
    candidate_classification: Mapping[str, object],
    champion_classification: Mapping[str, object],
    candidate_regression_provinces: Mapping[str, Mapping[str, object]],
    champion_regression_provinces: Mapping[str, Mapping[str, object]],
    candidate_ready: bool,
    required_provinces: int = 20,
) -> dict:
    """Return an auditable promotion decision evaluated on one common holdout.

    The challenger must pass its own deployment gates first. Both tasks must
    then be non-inferior to the active champion, no province may regress badly,
    and at least one task must improve materially. A failed or incomplete
    comparison always keeps the current Production run active.
    """
    reasons: list[str] = []
    if not candidate_ready:
        reasons.append("candidate_deployment_gate_failed")

    candidate_provinces = set(candidate_regression_provinces)
    champion_provinces = set(champion_regression_provinces)
    if len(candidate_provinces) != required_provinces:
        reasons.append("candidate_regression_province_count_mismatch")
    if candidate_provinces != champion_provinces:
        reasons.append("regression_province_sets_differ")

    try:
        c_mae = _number(candidate_regression, "mae")
        a_mae = _number(champion_regression, "mae")
        c_rmse = _number(candidate_regression, "rmse")
        a_rmse = _number(champion_regression, "rmse")
        c_r2 = _number(candidate_regression, "r2")
        a_r2 = _number(champion_regression, "r2")
        c_skill = _number(candidate_regression, "skill_vs_persistence")
        a_skill = _number(champion_regression, "skill_vs_persistence")

        regression_checks = {
            "mae_noninferior": c_mae <= a_mae * 1.005,
            "rmse_noninferior": c_rmse <= a_rmse * 1.01,
            "r2_noninferior": c_r2 >= a_r2 - 0.005,
            "skill_noninferior": c_skill >= a_skill - 0.002,
        }
        for name, passed in regression_checks.items():
            if not passed:
                reasons.append(f"regression_{name}_failed")

        province_failures: list[str] = []
        if candidate_provinces == champion_provinces:
            for province_id in sorted(candidate_provinces):
                candidate_mae = _number(
                    candidate_regression_provinces[province_id], "mae"
                )
                champion_mae = _number(
                    champion_regression_provinces[province_id], "mae"
                )
                if candidate_mae > champion_mae * 1.02:
                    province_failures.append(province_id)
            if province_failures:
                reasons.append(
                    "regression_province_mae_regressed:"
                    + ",".join(province_failures)
                )

        regression_material_gain = bool(
            c_skill >= a_skill + 0.0025 or c_mae <= a_mae * 0.995
        )

        classification_checks = {
            "macro_f1_noninferior": _number(
                candidate_classification, "macro_f1"
            )
            >= _number(champion_classification, "macro_f1") - 0.005,
            "balanced_accuracy_noninferior": _number(
                candidate_classification, "balanced_accuracy"
            )
            >= _number(champion_classification, "balanced_accuracy") - 0.005,
            "weighted_f1_noninferior": _number(
                candidate_classification, "weighted_f1"
            )
            >= _number(champion_classification, "weighted_f1") - 0.005,
            "accuracy_noninferior": _number(candidate_classification, "accuracy")
            >= _number(champion_classification, "accuracy") - 0.01,
            "class_4_recall_noninferior": _critical_recall(
                candidate_classification, 4
            )
            >= _critical_recall(champion_classification, 4) - 0.03,
            "class_5_recall_noninferior": _critical_recall(
                candidate_classification, 5
            )
            >= _critical_recall(champion_classification, 5) - 0.05,
        }
        for name, passed in classification_checks.items():
            if not passed:
                reasons.append(f"classification_{name}_failed")

        candidate_critical = min(
            _critical_recall(candidate_classification, 4),
            _critical_recall(candidate_classification, 5),
        )
        champion_critical = min(
            _critical_recall(champion_classification, 4),
            _critical_recall(champion_classification, 5),
        )
        classification_material_gain = bool(
            _number(candidate_classification, "macro_f1")
            >= _number(champion_classification, "macro_f1") + 0.005
            or _number(candidate_classification, "balanced_accuracy")
            >= _number(champion_classification, "balanced_accuracy") + 0.005
            or candidate_critical >= champion_critical + 0.02
        )
    except (KeyError, TypeError, ValueError) as exc:
        reasons.append(f"invalid_comparison_metrics:{type(exc).__name__}:{exc}")
        regression_checks = {}
        classification_checks = {}
        regression_material_gain = False
        classification_material_gain = False
        province_failures = []

    material_gain = bool(regression_material_gain or classification_material_gain)
    if not material_gain:
        reasons.append("no_material_improvement")

    approved = not reasons
    return {
        "policy_version": POLICY_VERSION,
        "approved": approved,
        "decision": "promote" if approved else "keep_champion",
        "reasons": reasons or ["challenger_better_and_noninferior"],
        "regression_checks": regression_checks,
        "classification_checks": classification_checks,
        "regression_material_gain": regression_material_gain,
        "classification_material_gain": classification_material_gain,
        "province_mae_failures": province_failures,
        "comparison_basis": "same_latest_365_day_d1_holdout",
    }
