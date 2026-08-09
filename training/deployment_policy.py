"""Auditable operational deployment policies for trained PM2.5 models.

Research eligibility is intentionally preserved separately from operational
deployment eligibility.  The conditional policy below is narrowly scoped to
the single reviewed near-threshold TH-34 result and must never be presented as
a strict 4.5% research pass.
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence


REGRESSION_STRICT_MINIMUM_SKILL = 0.045
REGRESSION_CONDITIONAL_FLOOR = 0.0445
REGRESSION_CONDITIONAL_PROVINCES = ("TH-34",)
REGRESSION_CONDITIONAL_POLICY = "single_near_threshold_province_v1"
REGRESSION_CONDITIONAL_OVERRIDE_REASON = (
    "near-threshold operational acceptance; strict research gate remains failed"
)


def _original_local_eligible(metrics: Mapping[str, object]) -> bool:
    return bool(
        metrics.get(
            "strict_eligible",
            metrics.get("local_eligible", metrics.get("eligible", False)),
        )
    )


def _reasons(metrics: Mapping[str, object]) -> list[str]:
    raw = metrics.get(
        "strict_eligibility_reasons",
        metrics.get("eligibility_reasons", []),
    )
    return (
        [str(reason) for reason in raw]
        if isinstance(raw, Sequence) and not isinstance(raw, (str, bytes))
        else []
    )


def _finite_number(value: object) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _reported_failed_provinces(global_reasons: Sequence[str]) -> set[str]:
    reported: set[str] = set()
    for reason in global_reasons:
        if not reason.startswith("province_gate_failed:"):
            continue
        reported.update(
            province_id
            for province_id in reason.split(":", 1)[1].split(",")
            if province_id
        )
    return reported


def evaluate_regression_deployment_policy(
    province_metrics: Mapping[str, Mapping[str, object]],
    *,
    original_global_eligible: bool,
    original_global_reasons: Sequence[str],
    expected_provinces: int,
    minimum_validation_rows: int,
    minimum_test_rows: int,
    strict_minimum_skill: float = REGRESSION_STRICT_MINIMUM_SKILL,
    conditional_floor: float = REGRESSION_CONDITIONAL_FLOOR,
    conditional_provinces: Sequence[str] = REGRESSION_CONDITIONAL_PROVINCES,
) -> dict:
    """Evaluate strict and narrowly conditional regression deployment tiers.

    A conditional deployment is allowed only when exactly one reviewed
    allowlisted province is the sole strict failure and every other province
    passes the unchanged strict gate.  Test evidence is not rewritten: the
    result carries both strict and deployment eligibility.
    """

    if not 0.0 <= conditional_floor < strict_minimum_skill < 1.0:
        raise ValueError("conditional floor must be below the strict Skill threshold")
    if expected_provinces <= 0:
        raise ValueError("expected_provinces must be positive")

    allowed_conditional = set(conditional_provinces)
    province_decisions: dict[str, dict] = {}
    strict_provinces: list[str] = []
    conditional_candidates: list[str] = []

    for province_id in sorted(province_metrics):
        metrics = province_metrics[province_id]
        skill = _finite_number(metrics.get("skill_vs_persistence"))
        mae = _finite_number(metrics.get("mae"))
        baseline = metrics.get("baseline", {})
        baseline_mae = (
            _finite_number(baseline.get("mae"))
            if isinstance(baseline, Mapping)
            else None
        )
        validation = metrics.get("validation", {})
        validation_rows = (
            int(validation.get("test_rows", 0))
            if isinstance(validation, Mapping)
            else 0
        )
        validation_mae = (
            _finite_number(validation.get("mae"))
            if isinstance(validation, Mapping)
            else None
        )
        test_rows = int(metrics.get("test_rows", 0) or 0)
        reasons = _reasons(metrics)
        original_local_eligible = _original_local_eligible(metrics)

        strict_eligible = bool(
            original_local_eligible
            and skill is not None
            and skill >= strict_minimum_skill
        )
        conditional_candidate = bool(
            not strict_eligible
            and province_id in allowed_conditional
            and skill is not None
            and conditional_floor <= skill < strict_minimum_skill
            and reasons == ["skill_below_threshold"]
            and test_rows >= minimum_test_rows
            and validation_rows >= minimum_validation_rows
            and mae is not None
            and baseline_mae is not None
            and mae < baseline_mae
            and validation_mae is not None
        )

        if strict_eligible:
            strict_provinces.append(province_id)
        elif conditional_candidate:
            conditional_candidates.append(province_id)

        province_decisions[province_id] = {
            "strict_eligible": strict_eligible,
            "conditional_candidate": conditional_candidate,
            "deployment_eligible": False,
            "activation_tier": "strict" if strict_eligible else "ineligible",
            "observed_skill": skill,
            "target_skill": strict_minimum_skill,
            "conditional_floor": conditional_floor,
            "strict_eligibility_reasons": reasons,
            "override_reason": None,
        }

    global_blockers = [
        str(reason)
        for reason in original_global_reasons
        if reason != "eligible" and not str(reason).startswith("province_gate_failed:")
    ]
    reported_failed = _reported_failed_provinces(
        [str(reason) for reason in original_global_reasons]
    )
    complete_pool = len(province_decisions) == expected_provinces
    all_strict = bool(
        complete_pool
        and len(strict_provinces) == expected_provinces
        and original_global_eligible
        and not global_blockers
        and not reported_failed
    )
    conditional_pass = bool(
        complete_pool
        and len(strict_provinces) == expected_provinces - 1
        and len(conditional_candidates) == 1
        and not global_blockers
        and reported_failed == set(conditional_candidates)
    )
    deployment_eligible = all_strict or conditional_pass

    for province_id, decision in province_decisions.items():
        is_conditional = conditional_pass and province_id in conditional_candidates
        decision["deployment_eligible"] = bool(
            deployment_eligible and (decision["strict_eligible"] or is_conditional)
        )
        if is_conditional:
            decision["activation_tier"] = "conditional"
            decision["override_reason"] = REGRESSION_CONDITIONAL_OVERRIDE_REASON

    deployment_failed = sorted(
        province_id
        for province_id, decision in province_decisions.items()
        if not decision["deployment_eligible"]
    )
    if all_strict:
        deployment_reasons = ["eligible_under_strict_policy"]
    elif conditional_pass:
        deployment_reasons = [
            "eligible_under_conditional_policy",
            *(f"conditional_province:{province_id}" for province_id in conditional_candidates),
        ]
    else:
        deployment_reasons = [
            *global_blockers,
            *(f"deployment_province_failed:{province_id}" for province_id in deployment_failed),
        ] or ["regression_deployment_policy_failed"]

    return {
        "policy": REGRESSION_CONDITIONAL_POLICY,
        "strict_minimum_skill": strict_minimum_skill,
        "conditional_floor": conditional_floor,
        "conditional_allowlist": sorted(allowed_conditional),
        "strict_global_eligible": all_strict,
        "original_global_eligible": bool(original_global_eligible),
        "original_global_reasons": [str(reason) for reason in original_global_reasons],
        "deployment_eligible": deployment_eligible,
        "deployment_reasons": deployment_reasons,
        "strict_provinces": strict_provinces,
        "conditional_provinces": conditional_candidates if conditional_pass else [],
        "deployment_failed_provinces": deployment_failed,
        "province_decisions": province_decisions,
        "research_reporting_note": (
            "Conditional provinces remain strict research failures at the 4.5% Skill gate."
        ),
    }
