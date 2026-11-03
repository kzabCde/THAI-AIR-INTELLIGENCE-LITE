"""Balanced, province-local PM2.5 model release criteria (pure decision only).

This module never writes Production and never changes the underlying trainer.
A 4.0–4.5% skill band is a *conditional* scientific threshold, not an
exemption from data QA, full-year validation, runtime equivalence or rollback.
"""
from __future__ import annotations

import math
from typing import Any

POLICY_VERSION = "balanced-selective-province-v1"
REGRESSION_STANDARD_SKILL = 0.045
REGRESSION_CONDITIONAL_SKILL_FLOOR = 0.040
REGRESSION_MIN_EVALUATION_DAYS = 365
REGRESSION_HIGH_PM_THRESHOLD = 37.5
REGRESSION_HIGH_PM_MIN_SUPPORT = 10
REGRESSION_HIGH_PM_MAX_MAE_RATIO = 1.20
CHAMPION_MIN_RELATIVE_MAE_GAIN = 0.005


def decide_regression_candidate(
    *,
    test_skill: float,
    validation_skill: float,
    validation_mae: float,
    persistence_validation_mae: float,
    test_rows: int,
    validation_rows: int,
    high_pm_support: int,
    high_pm_mae: float | None,
    high_pm_persistence_mae: float | None,
    native_portable_parity: bool,
    source_qa_passed: bool,
    other_training_failures: tuple[str, ...] = (),
    champion_validation_mae: float | None = None,
    champion_present: bool = False,
) -> dict[str, Any]:
    """Assess one *fresh* candidate, never with arbitrary historical reranking.

    A missing/unverifiable champion is never overwritten. A province without a
    champion can bootstrap if the validated candidate passes. Strictly local
    non-skill trainer failures (e.g. overfitting or incomplete rows) stay fatal.
    The high-pollution safety comparison uses observations >37.5 ug/m3.
    """
    reasons: list[str] = []
    metrics = [test_skill, validation_skill, validation_mae, persistence_validation_mae]
    if any(not math.isfinite(float(v)) for v in metrics):
        reasons.append("non_finite_skill_or_mae")
    if test_rows < REGRESSION_MIN_EVALUATION_DAYS or validation_rows < REGRESSION_MIN_EVALUATION_DAYS:
        reasons.append("insufficient_full_year_validation_or_test")
    if not source_qa_passed:
        reasons.append("canonical_source_qa_not_verified")
    if not native_portable_parity:
        reasons.append("native_portable_runtime_parity_failed")
    if other_training_failures:
        reasons.extend(f"training:{x}" for x in other_training_failures)
    if persistence_validation_mae <= 0 or validation_mae >= persistence_validation_mae:
        reasons.append("validation_not_better_than_persistence")
    if test_skill < REGRESSION_CONDITIONAL_SKILL_FLOOR:
        reasons.append("test_skill_below_conditional_floor")
    if validation_skill < REGRESSION_CONDITIONAL_SKILL_FLOOR:
        reasons.append("validation_skill_below_conditional_floor")

    grade = (
        "standard" if min(test_skill, validation_skill) >= REGRESSION_STANDARD_SKILL
        else "conditional" if min(test_skill, validation_skill) >= REGRESSION_CONDITIONAL_SKILL_FLOOR
        else "rejected"
    )
    high_pm_ratio: float | None = None
    if grade == "conditional" and high_pm_support < REGRESSION_HIGH_PM_MIN_SUPPORT:
        reasons.append("conditional_high_pm_support_insufficient")
    if high_pm_support >= REGRESSION_HIGH_PM_MIN_SUPPORT:
        if (
            high_pm_mae is None
            or high_pm_persistence_mae is None
            or not math.isfinite(float(high_pm_mae))
            or not math.isfinite(float(high_pm_persistence_mae))
            or high_pm_persistence_mae <= 0
        ):
            reasons.append("high_pm_validation_unverifiable")
        else:
            high_pm_ratio = float(high_pm_mae) / float(high_pm_persistence_mae)
            if high_pm_ratio > REGRESSION_HIGH_PM_MAX_MAE_RATIO:
                reasons.append("high_pm_mae_safety_cap_exceeded")
    elif high_pm_support < 0:
        reasons.append("high_pm_support_invalid")

    champion_relative_gain: float | None = None
    if champion_present:
        if (
            champion_validation_mae is None
            or not math.isfinite(float(champion_validation_mae))
            or champion_validation_mae <= 0
        ):
            reasons.append("matched_champion_comparison_missing")
        else:
            champion_relative_gain = 1 - validation_mae / champion_validation_mae
            if champion_relative_gain < CHAMPION_MIN_RELATIVE_MAE_GAIN:
                reasons.append("candidate_does_not_materially_beat_champion")

    approved = not reasons and grade in {"standard", "conditional"}
    return {
        "policy_version": POLICY_VERSION,
        "grade": grade,
        "eligible": approved,
        "reasons": reasons or ["approved_for_release_preflight"],
        "test_skill": float(test_skill),
        "validation_skill": float(validation_skill),
        "high_pm_mae_ratio": high_pm_ratio,
        "high_pm_support": int(high_pm_support),
        "champion_relative_gain": champion_relative_gain,
        "requires_production_qa_and_e2e": True,
    }
