from __future__ import annotations

from pathlib import Path

import pytest

from training.v5_7_5_activation_contract import (
    CONTRACT_VERSION,
    apply_activation_plan,
    build_activation_plan,
    preflight_activation_plan,
    rollback_activation,
    validate_activation_plan,
)

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = (
    ROOT
    / "supabase"
    / "migrations"
    / "20260923014500_v575_production_activation_contract.sql"
)


class _Response:
    def __init__(self, data):
        self.data = data


class _Rpc:
    def __init__(self, client, name, payload):
        self.client = client
        self.name = name
        self.payload = payload

    def execute(self):
        self.client.calls.append((self.name, self.payload))
        return _Response(self.client.responses[self.name])


class FakeClient:
    def __init__(self):
        self.calls = []
        self.responses = {
            "fn_preflight_daily_model_activation": {
                "ok": True,
                "preflight_only": True,
            },
            "fn_apply_daily_model_activation": {
                "ok": True,
                "atomic": True,
                "activation_id": "00000000-0000-0000-0000-000000000001",
            },
            "fn_rollback_daily_model_activation": {
                "ok": True,
                "atomic": True,
                "status": "rolled_back",
            },
        }

    def rpc(self, name, payload):
        return _Rpc(self, name, payload)


def _plans():
    regression = [
        {
            "province_id": "TH-30",
            "activate_current_candidate": True,
            "hold_previous_active": False,
            "use_fallback": False,
            "transition_action": "activate_current_lightgbm",
            "model_selected": "lightgbm-pm25-residual-v2",
            "current_skill": 0.051,
            "previous_run_skill": 0.050,
            "skill_delta": 0.001,
            "consecutive_pass_days": 2,
            "consecutive_fail_days": 0,
            "catastrophic_failure": False,
            "fallback_reason": None,
        },
        {
            "province_id": "TH-31",
            "activate_current_candidate": False,
            "hold_previous_active": True,
            "use_fallback": False,
            "transition_action": "hold_previous_lightgbm",
            "model_selected": "lightgbm-pm25-residual-v2",
            "current_skill": 0.0449,
            "previous_run_skill": 0.052,
            "skill_delta": -0.0071,
            "consecutive_pass_days": 0,
            "consecutive_fail_days": 1,
            "catastrophic_failure": False,
            "fallback_reason": "single_day_marginal_failure_hysteresis_hold",
        },
        {
            "province_id": "TH-32",
            "activate_current_candidate": False,
            "hold_previous_active": False,
            "use_fallback": True,
            "transition_action": "fallback_after_consecutive_failures",
            "model_selected": "recent-mean-v1",
            "current_skill": 0.031,
            "previous_run_skill": 0.044,
            "skill_delta": -0.013,
            "consecutive_pass_days": 0,
            "consecutive_fail_days": 4,
            "catastrophic_failure": False,
            "fallback_reason": "4_consecutive_strict_failures",
        },
    ]
    classification = [
        {
            "province_id": province_id,
            "direct_rf_eligible": False,
            "classification_source": "regression_threshold",
            "fallback_used": True,
            "fallback_reason": "direct_rf_gate_failed",
            "activate_current_classifier": False,
            "deactivate_prior_classifier": True,
        }
        for province_id in ("TH-30", "TH-31", "TH-32")
    ]
    return regression, classification


def test_build_activation_plan_maps_all_v575_actions():
    regression, classification = _plans()
    plan = build_activation_plan(regression, classification)
    by_pair = {
        (row["province_id"], row["task_type"]): row for row in plan
    }

    assert by_pair[("TH-30", "regression")]["action"] == "activate_candidate"
    assert by_pair[("TH-31", "regression")]["action"] == "hold_previous"
    assert by_pair[("TH-32", "regression")]["action"] == "deactivate_to_fallback"
    assert {
        by_pair[(province_id, "classification")]["action"]
        for province_id in ("TH-30", "TH-31", "TH-32")
    } == {"deactivate_to_regression_threshold"}


def test_activation_plan_rejects_incomplete_pairs():
    regression, classification = _plans()
    plan = build_activation_plan(regression, classification)
    with pytest.raises(ValueError, match="expected 6 task actions"):
        validate_activation_plan(
            plan[:-1],
            expected_provinces=("TH-30", "TH-31", "TH-32"),
        )


def test_rpc_wrappers_keep_preflight_apply_and_rollback_separate():
    regression, classification = _plans()
    plan = build_activation_plan(regression, classification)
    client = FakeClient()

    preflight = preflight_activation_plan(
        client,
        run_id="00000000-0000-0000-0000-000000000010",
        plan=plan,
        required_provinces=3,
    )
    applied = apply_activation_plan(
        client,
        run_id="00000000-0000-0000-0000-000000000010",
        plan=plan,
        required_provinces=3,
    )
    rolled_back = rollback_activation(
        client,
        activation_id=applied["activation_id"],
    )

    assert preflight["preflight_only"] is True
    assert rolled_back["status"] == "rolled_back"
    assert [name for name, _ in client.calls] == [
        "fn_preflight_daily_model_activation",
        "fn_apply_daily_model_activation",
        "fn_rollback_daily_model_activation",
    ]
    assert client.calls[1][1]["p_contract_version"] == CONTRACT_VERSION


def test_migration_is_atomic_service_only_and_auditable():
    sql = MIGRATION.read_text(encoding="utf-8")

    assert "create table if not exists public.model_activation_audit" in sql
    assert "fn_preflight_daily_model_activation" in sql
    assert "fn_apply_daily_model_activation" in sql
    assert "fn_rollback_daily_model_activation" in sql
    assert "pg_advisory_xact_lock" in sql
    assert "before_state" in sql
    assert "after_state" in sql
    assert "rollback_state" in sql
    assert "deactivate_to_fallback" in sql
    assert "deactivate_to_regression_threshold" in sql
    assert "hold_previous" in sql
    assert "from public, anon, authenticated" in sql
    assert "to service_role" in sql
