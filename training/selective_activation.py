"""Province-selective promotion using the existing v5.7.5 activation contract.

Only a validated, locally eligible candidate may replace an active champion.
Scores for champions and challengers MUST be calculated on the identical,
chronologically held-out observations. Missing comparison data fails closed.
No database operations happen in this module.
"""
from __future__ import annotations

import math
from collections import Counter
from collections.abc import Mapping, Sequence

from training.v5_7_5_activation_contract import validate_activation_plan

MIN_REGRESSION_SKILL = 0.045
MIN_CRITICAL_SUPPORT = 5


def _finite(value: object) -> float | None:
    try:
        number = float(value)
    except (ValueError, TypeError):
        return None
    return number if math.isfinite(number) else None


def _eligible_candidate(row: Mapping, task: str) -> bool:
    if row.get("eligibility_status") is not True or row.get("evidence_status") != "validated":
        return False
    metrics = row.get("metrics") or {}
    if int(row.get("test_rows") or 0) < 365:
        return False
    if task == "regression":
        skill = _finite(metrics.get("skill_vs_persistence"))
        if skill is None:
            baseline = _finite((row.get("baseline_metrics") or {}).get("mae"))
            mae = _finite(metrics.get("mae"))
            skill = 1.0 - mae / baseline if mae is not None and baseline and baseline > 0 else None
        return skill is not None and skill >= MIN_REGRESSION_SKILL
    if metrics.get("metric_class_contract") != [1, 2, 3, 4, 5]:
        return False
    evidence = metrics.get("per_class") or {}
    # Enforce provincial support and critical recall, not just aggregate accuracy.
    for cls in (4, 5):
        part = evidence.get(str(cls)) or {}
        if int(part.get("support") or 0) < MIN_CRITICAL_SUPPORT:
            return False
        recall = _finite(part.get("recall"))
        if recall is None or recall < 0.35:
            return False
    return _finite(metrics.get("macro_f1")) is not None


def _wins_same_holdout(row: Mapping, champion: Mapping | None, task: str) -> bool:
    if champion is None or champion.get("same_holdout") is not True:
        return False
    challenger_rows = int(row.get("test_rows") or 0)
    if challenger_rows != int(champion.get("test_rows") or -1):
        return False
    metric = "mae" if task == "regression" else "macro_f1"
    candidate_score = _finite((row.get("metrics") or {}).get(metric))
    champion_score = _finite(champion.get(metric))
    if candidate_score is None or champion_score is None:
        return False
    margin = 1e-9
    return (
        candidate_score < champion_score - margin
        if task == "regression"
        else candidate_score > champion_score + margin
    )


def build_selective_activation_plan(
    provinces: Sequence[str],
    registry_rows: Sequence[Mapping],
    active: Mapping[str, Mapping[str, Mapping]],
    champion_scores: Mapping[str, Mapping[str, Mapping]],
) -> tuple[list[dict], dict]:
    """Build exactly 40 actions while retaining every eligible active champion."""
    ids = sorted(set(provinces))
    if len(ids) != 20 or len(ids) != len(provinces):
        raise ValueError("selective promotion requires 20 unique provinces")
    candidate_rows = {
        (str(row["province_id"]), str(row["task_type"])): row
        for row in registry_rows
    }
    if len(candidate_rows) != 40:
        raise ValueError("candidate registry must have 40 distinct province/task rows")
    actions: list[dict] = []
    for province_id in ids:
        for task in ("regression", "classification"):
            pair = (province_id, task)
            candidate = candidate_rows[pair]
            champion = (active.get(task) or {}).get(province_id)
            eligible = _eligible_candidate(candidate, task)
            champion_score = (champion_scores.get(task) or {}).get(province_id)
            if eligible and (champion is None or _wins_same_holdout(candidate, champion_score, task)):
                action = "activate_candidate"
                reason = "eligible_missing_slot" if champion is None else "better_on_same_holdout"
            elif champion is not None:
                action = "hold_previous"
                reason = "candidate_ineligible_or_not_proven_superior"
            else:
                action = (
                    "deactivate_to_fallback"
                    if task == "regression"
                    else "deactivate_to_regression_threshold"
                )
                reason = "no_eligible_candidate"
            item = {
                "province_id": province_id,
                "task_type": task,
                "action": action,
                "selection_reason": reason,
            }
            if action == "activate_candidate":
                item["model_name"] = candidate["model_name"]
            actions.append(item)
    validate_activation_plan(actions, expected_provinces=ids)
    counts = dict(Counter(action["action"] for action in actions))
    return actions, {
        "province_count": len(ids),
        "plan_rows": len(actions),
        "counts": counts,
        "activation_count": counts.get("activate_candidate", 0),
        "hold_count": counts.get("hold_previous", 0),
        "fallback_count": (
            counts.get("deactivate_to_fallback", 0)
            + counts.get("deactivate_to_regression_threshold", 0)
        ),
    }
