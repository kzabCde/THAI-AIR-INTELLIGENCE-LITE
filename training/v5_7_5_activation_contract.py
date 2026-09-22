"""v5.7.5 production activation plan client.

The database RPC is the source of truth for atomicity. This module only:
1. converts the evaluated daily serving plans into the RPC contract,
2. validates plan completeness locally,
3. performs preflight, apply, and rollback calls through the service-role client.

No activation is performed unless ``apply_activation_plan`` is called explicitly.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from typing import Any
import math

CONTRACT_VERSION = "v5.7.5-production-activation-v1"
REGRESSION_MODEL_NAME = "lightgbm-pm25-residual-v2"
CLASSIFICATION_MODEL_NAME = "random-forest-aqi-classifier-pooled-v1"

REGRESSION_ACTIONS = {
    "activate_candidate",
    "hold_previous",
    "deactivate_to_fallback",
}
CLASSIFICATION_ACTIONS = {
    "activate_candidate",
    "hold_previous",
    "deactivate_to_regression_threshold",
}


def _json_value(value: Any) -> Any:
    """Return a PostgREST-safe scalar for plan audit metadata."""
    if value is None:
        return None
    if hasattr(value, "item"):
        try:
            value = value.item()
        except (TypeError, ValueError):
            pass
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value


def _records(value: Any) -> list[dict[str, Any]]:
    if hasattr(value, "to_dict"):
        try:
            return [dict(row) for row in value.to_dict("records")]
        except TypeError:
            pass
    if isinstance(value, Mapping):
        return [dict(value)]
    return [dict(row) for row in value]


def build_activation_plan(
    daily_deployment_plan: Any,
    classification_serving_plan: Any,
    *,
    regression_model_name: str = REGRESSION_MODEL_NAME,
    classification_model_name: str = CLASSIFICATION_MODEL_NAME,
) -> list[dict[str, Any]]:
    """Translate v5.7.5 evaluation tables into the database activation contract."""

    regression_rows = _records(daily_deployment_plan)
    classification_rows = _records(classification_serving_plan)
    classification_by_province = {
        str(row["province_id"]): row for row in classification_rows
    }

    plan: list[dict[str, Any]] = []
    for row in regression_rows:
        province_id = str(row["province_id"])

        if bool(row.get("activate_current_candidate")):
            regression_action = "activate_candidate"
            regression_model = regression_model_name
        elif bool(row.get("hold_previous_active")):
            regression_action = "hold_previous"
            regression_model = None
        elif bool(row.get("use_fallback")):
            regression_action = "deactivate_to_fallback"
            regression_model = None
        else:
            raise ValueError(
                f"{province_id}: regression plan must select exactly one action"
            )

        regression_item = {
            "province_id": province_id,
            "task_type": "regression",
            "action": regression_action,
            "model_name": regression_model,
            "transition_action": _json_value(row.get("transition_action")),
            "model_selected": _json_value(row.get("model_selected")),
            "current_skill": _json_value(row.get("current_skill")),
            "previous_run_skill": _json_value(row.get("previous_run_skill")),
            "skill_delta": _json_value(row.get("skill_delta")),
            "consecutive_pass_days": _json_value(row.get("consecutive_pass_days")),
            "consecutive_fail_days": _json_value(row.get("consecutive_fail_days")),
            "catastrophic_failure": bool(row.get("catastrophic_failure", False)),
            "fallback_reason": _json_value(row.get("fallback_reason")),
        }
        plan.append(regression_item)

        classification = classification_by_province.get(province_id)
        if classification is None:
            raise ValueError(
                f"{province_id}: classification serving decision is missing"
            )

        activate_classifier = bool(
            classification.get("activate_current_classifier")
        )
        deactivate_classifier = bool(
            classification.get("deactivate_prior_classifier")
        )
        if activate_classifier == deactivate_classifier:
            raise ValueError(
                f"{province_id}: classification plan must activate or deactivate exactly once"
            )

        classification_action = (
            "activate_candidate"
            if activate_classifier
            else "deactivate_to_regression_threshold"
        )
        plan.append(
            {
                "province_id": province_id,
                "task_type": "classification",
                "action": classification_action,
                "model_name": (
                    classification_model_name if activate_classifier else None
                ),
                "classification_source": _json_value(
                    classification.get("classification_source")
                ),
                "direct_rf_eligible": bool(
                    classification.get("direct_rf_eligible", False)
                ),
                "fallback_used": bool(
                    classification.get("fallback_used", False)
                ),
                "fallback_reason": _json_value(
                    classification.get("fallback_reason")
                ),
            }
        )

    validate_activation_plan(
        plan,
        expected_provinces=[str(row["province_id"]) for row in regression_rows],
    )
    return plan


def validate_activation_plan(
    plan: Sequence[Mapping[str, Any]],
    *,
    expected_provinces: Iterable[str],
) -> None:
    """Validate the complete 2-actions-per-province contract before RPC calls."""

    expected = tuple(sorted(set(str(value) for value in expected_provinces)))
    if not expected:
        raise ValueError("expected_provinces must not be empty")
    if len(plan) != len(expected) * 2:
        raise ValueError(
            f"expected {len(expected) * 2} task actions, found {len(plan)}"
        )

    seen: set[tuple[str, str]] = set()
    for raw in plan:
        province_id = str(raw.get("province_id") or "")
        task_type = str(raw.get("task_type") or "")
        action = str(raw.get("action") or "")
        if province_id not in expected:
            raise ValueError(f"unknown province in activation plan: {province_id}")
        if task_type not in {"regression", "classification"}:
            raise ValueError(
                f"{province_id}: unsupported task type {task_type!r}"
            )
        pair = (province_id, task_type)
        if pair in seen:
            raise ValueError(
                f"duplicate province/task activation action: {pair}"
            )
        seen.add(pair)

        allowed = (
            REGRESSION_ACTIONS
            if task_type == "regression"
            else CLASSIFICATION_ACTIONS
        )
        if action not in allowed:
            raise ValueError(
                f"{province_id}/{task_type}: unsupported action {action!r}"
            )
        if action == "activate_candidate" and not raw.get("model_name"):
            raise ValueError(
                f"{province_id}/{task_type}: activate_candidate requires model_name"
            )

    expected_pairs = {
        (province_id, task_type)
        for province_id in expected
        for task_type in ("regression", "classification")
    }
    if seen != expected_pairs:
        missing = sorted(expected_pairs - seen)
        extra = sorted(seen - expected_pairs)
        raise ValueError(
            f"activation plan pair mismatch; missing={missing}, extra={extra}"
        )


def _rpc_data(response: Any) -> Any:
    data = getattr(response, "data", None)
    if data is None:
        raise RuntimeError("activation RPC returned no data")
    return data


def preflight_activation_plan(
    sb: Any,
    *,
    run_id: str,
    plan: Sequence[Mapping[str, Any]],
    required_provinces: int,
) -> dict[str, Any]:
    response = sb.rpc(
        "fn_preflight_daily_model_activation",
        {
            "p_run_id": run_id,
            "p_plan": list(plan),
            "p_required_provinces": int(required_provinces),
        },
    ).execute()
    data = _rpc_data(response)
    if not isinstance(data, dict) or data.get("ok") is not True:
        raise RuntimeError(f"activation preflight did not return ok=true: {data!r}")
    return data


def apply_activation_plan(
    sb: Any,
    *,
    run_id: str,
    plan: Sequence[Mapping[str, Any]],
    required_provinces: int,
    contract_version: str = CONTRACT_VERSION,
) -> dict[str, Any]:
    """Atomically apply the complete activation plan after server-side preflight."""

    response = sb.rpc(
        "fn_apply_daily_model_activation",
        {
            "p_run_id": run_id,
            "p_plan": list(plan),
            "p_required_provinces": int(required_provinces),
            "p_contract_version": contract_version,
        },
    ).execute()
    data = _rpc_data(response)
    if not isinstance(data, dict) or data.get("ok") is not True:
        raise RuntimeError(f"activation apply did not return ok=true: {data!r}")
    if data.get("atomic") is not True:
        raise RuntimeError(f"activation apply did not confirm atomic=true: {data!r}")
    return data


def rollback_activation(
    sb: Any,
    *,
    activation_id: str,
) -> dict[str, Any]:
    """Restore the exact active registry ids captured by an activation audit."""

    response = sb.rpc(
        "fn_rollback_daily_model_activation",
        {"p_activation_id": activation_id},
    ).execute()
    data = _rpc_data(response)
    if not isinstance(data, dict) or data.get("ok") is not True:
        raise RuntimeError(f"activation rollback did not return ok=true: {data!r}")
    if data.get("status") != "rolled_back":
        raise RuntimeError(
            f"activation rollback did not confirm rolled_back: {data!r}"
        )
    return data
