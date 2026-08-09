from copy import deepcopy

from training.deployment_policy import evaluate_regression_deployment_policy


def _metric(skill=0.06, *, reasons=None, local_eligible=True):
    baseline_mae = 4.237178
    return {
        "skill_vs_persistence": skill,
        "mae": baseline_mae * (1.0 - skill),
        "baseline": {"mae": baseline_mae},
        "validation": {"mae": 3.9, "test_rows": 365},
        "test_rows": 365,
        "eligible": local_eligible,
        "local_eligible": local_eligible,
        "eligibility_reasons": reasons or ["eligible"],
    }


def _twenty_provinces():
    province_ids = [f"TH-{value:02d}" for value in range(30, 50)]
    return {province_id: _metric() for province_id in province_ids}


def _evaluate(metrics, *, global_eligible, global_reasons):
    return evaluate_regression_deployment_policy(
        metrics,
        original_global_eligible=global_eligible,
        original_global_reasons=global_reasons,
        expected_provinces=20,
        minimum_validation_rows=365,
        minimum_test_rows=365,
    )


def test_all_strict_provinces_pass_without_conditional_override():
    result = _evaluate(
        _twenty_provinces(),
        global_eligible=True,
        global_reasons=["eligible"],
    )

    assert result["deployment_eligible"]
    assert result["strict_global_eligible"]
    assert result["conditional_provinces"] == []
    assert all(
        item["activation_tier"] == "strict"
        for item in result["province_decisions"].values()
    )


def test_th34_near_threshold_is_the_only_conditional_pass():
    metrics = _twenty_provinces()
    metrics["TH-34"] = _metric(
        0.0447517,
        reasons=["skill_below_threshold"],
        local_eligible=False,
    )

    result = _evaluate(
        metrics,
        global_eligible=False,
        global_reasons=["eligible", "province_gate_failed:TH-34"],
    )

    decision = result["province_decisions"]["TH-34"]
    assert result["deployment_eligible"]
    assert not result["strict_global_eligible"]
    assert result["conditional_provinces"] == ["TH-34"]
    assert not decision["strict_eligible"]
    assert decision["deployment_eligible"]
    assert decision["activation_tier"] == "conditional"
    assert "strict research gate remains failed" in decision["override_reason"]


def test_conditional_floor_is_not_rounded_up():
    metrics = _twenty_provinces()
    metrics["TH-34"] = _metric(
        0.0444999,
        reasons=["skill_below_threshold"],
        local_eligible=False,
    )

    result = _evaluate(
        metrics,
        global_eligible=False,
        global_reasons=["eligible", "province_gate_failed:TH-34"],
    )

    assert not result["deployment_eligible"]
    assert result["conditional_provinces"] == []


def test_conditional_policy_does_not_apply_to_an_unreviewed_province():
    metrics = _twenty_provinces()
    metrics["TH-35"] = _metric(
        0.0448,
        reasons=["skill_below_threshold"],
        local_eligible=False,
    )

    result = _evaluate(
        metrics,
        global_eligible=False,
        global_reasons=["eligible", "province_gate_failed:TH-35"],
    )

    assert not result["deployment_eligible"]
    assert result["province_decisions"]["TH-35"]["activation_tier"] == "ineligible"


def test_additional_failure_reason_blocks_conditional_activation():
    metrics = _twenty_provinces()
    metrics["TH-34"] = _metric(
        0.0448,
        reasons=["skill_below_threshold", "severe_overfitting"],
        local_eligible=False,
    )

    result = _evaluate(
        metrics,
        global_eligible=False,
        global_reasons=["eligible", "province_gate_failed:TH-34"],
    )

    assert not result["deployment_eligible"]


def test_incomplete_validation_evidence_blocks_conditional_activation():
    metrics = _twenty_provinces()
    metrics["TH-34"] = _metric(
        0.0448,
        reasons=["skill_below_threshold"],
        local_eligible=False,
    )
    metrics["TH-34"]["validation"]["test_rows"] = 364

    result = _evaluate(
        metrics,
        global_eligible=False,
        global_reasons=["eligible", "province_gate_failed:TH-34"],
    )

    assert not result["deployment_eligible"]


def test_a_second_strict_failure_blocks_the_single_province_override():
    metrics = _twenty_provinces()
    metrics["TH-34"] = _metric(
        0.0448,
        reasons=["skill_below_threshold"],
        local_eligible=False,
    )
    metrics["TH-35"] = deepcopy(metrics["TH-34"])

    result = _evaluate(
        metrics,
        global_eligible=False,
        global_reasons=["eligible", "province_gate_failed:TH-34,TH-35"],
    )

    assert not result["deployment_eligible"]
    assert result["conditional_provinces"] == []
