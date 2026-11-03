#!/usr/bin/env python3
"""Standard PM2.5 model activation using existing guarded Supabase contract.

No experimental report/version label, 30-day prospective quota, or eight-gate
research threshold controls serving. Candidate eligibility is decided by the
validated training pipeline and rechecked by the database's atomic preflight.

The default is READ-ONLY. This script does not register models or start a new
training run. Each selected candidate must already be registered with a real
immutable portable runtime artifact.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any
from uuid import UUID

from training.dual_model_config import POOLED_PROVINCE_IDS, POOLED_FEATURE_VERSION
from training.train_pooled_models import get_client
from training.v5_7_5_activation_contract import (
    apply_activation_plan,
    preflight_activation_plan,
    rollback_activation,
    validate_activation_plan,
)

REGRESSION_MODEL = "lightgbm-pm25-residual-v2"
CLASSIFIER_MODEL = "random-forest-aqi-classifier-pooled-v1"
REGISTRY_FIELDS = (
    "id,province_id,task_type,run_id,model_name,eligibility_status,"
    "evidence_status,feature_version,runtime_artifact_uri,"
    "runtime_artifact_sha256,runtime_artifact_byte_size,runtime_artifact_format,"
    "is_active"
)
_SHA = re.compile(r"^[0-9a-f]{64}$")


def _candidate_ready(row: Mapping[str, Any] | None, task: str) -> bool:
    """Validate basic candidate registration; the SQL preflight is authoritative."""
    if not row or row.get("eligibility_status") is not True:
        return False
    if row.get("evidence_status") != "validated":
        return False
    if row.get("feature_version") != POOLED_FEATURE_VERSION:
        return False
    if row.get("model_name") != (REGRESSION_MODEL if task == "regression" else CLASSIFIER_MODEL):
        return False
    if not str(row.get("runtime_artifact_uri") or "").startswith("storage://model-artifacts/"):
        return False
    if not _SHA.fullmatch(str(row.get("runtime_artifact_sha256") or "")):
        return False
    if row.get("runtime_artifact_format") != "json+gzip":
        return False
    return int(row.get("runtime_artifact_byte_size") or 0) > 0


def build_standard_plan(
    provinces: Sequence[str],
    candidate_rows: Sequence[Mapping[str, Any]],
    active_rows: Sequence[Mapping[str, Any]],
) -> list[dict[str, str]]:
    """Full atomic plan: activate valid candidates, preserve active models, fallback.

    Research-only report and shadow-forecast criteria are not activation gates.
    Every province must have exactly one action per task.
    """
    expected = tuple(sorted(set(provinces)))
    if len(expected) != 20 or expected != tuple(sorted(POOLED_PROVINCE_IDS)):
        raise ValueError("The 20 official northeastern province IDs are required")

    candidate: dict[tuple[str, str], Mapping[str, Any]] = {}
    active: dict[tuple[str, str], Mapping[str, Any]] = {}
    for row, target in ((r, candidate) for r in candidate_rows):
        key = (str(row.get("province_id")), str(row.get("task_type")))
        if key in target:
            raise ValueError(f"Ambiguous duplicate candidate {key}")
        target[key] = row
    for row in active_rows:
        key = (str(row.get("province_id")), str(row.get("task_type")))
        if key in active:
            raise ValueError(f"Multiple active models for {key}")
        active[key] = row

    plan: list[dict[str, str]] = []
    for province in expected:
        for task in ("regression", "classification"):
            key = (province, task)
            proposed = candidate.get(key)
            incumbent = active.get(key)
            if _candidate_ready(proposed, task):
                if incumbent and str(incumbent.get("id")) == str(proposed.get("id")):
                    action = "hold_previous"
                else:
                    action = "activate_candidate"
            elif incumbent:
                action = "hold_previous"
            else:
                action = (
                    "deactivate_to_fallback" if task == "regression"
                    else "deactivate_to_regression_threshold"
                )
            item = {"province_id": province, "task_type": task, "action": action}
            if action == "activate_candidate":
                item["model_name"] = REGRESSION_MODEL if task == "regression" else CLASSIFIER_MODEL
            plan.append(item)
    validate_activation_plan(plan, expected_provinces=expected)
    return plan


def _verify_blob_sha(sb: Any, row: Mapping[str, Any]) -> None:
    uri = str(row["runtime_artifact_uri"])
    path = uri.removeprefix("storage://model-artifacts/")
    blob = sb.storage.from_("model-artifacts").download(path)
    expected_sha = str(row["runtime_artifact_sha256"])
    if not isinstance(blob, bytes):
        raise RuntimeError(f"Portable runtime download did not return bytes: {path}")
    if len(blob) != int(row["runtime_artifact_byte_size"]):
        raise RuntimeError(f"Portable runtime size mismatch: {path}")
    if hashlib.sha256(blob).hexdigest() != expected_sha:
        raise RuntimeError(f"Portable runtime SHA-256 mismatch: {path}")


def _readback(sb: Any, plan: Sequence[Mapping[str, str]], run_id: str,
              before_rows: Sequence[Mapping[str, Any]]) -> None:
    after = (
        sb.table("model_registry").select(REGISTRY_FIELDS)
        .eq("is_active", True).execute().data or []
    )
    previous = {(r["province_id"], r["task_type"]): r for r in before_rows}
    current = {(r["province_id"], r["task_type"]): r for r in after}
    for item in plan:
        key = (item["province_id"], item["task_type"])
        actual = current.get(key)
        action = item["action"]
        if action == "activate_candidate":
            if not actual or str(actual["run_id"]) != run_id:
                raise RuntimeError(f"Activation readback mismatch for {key}")
        elif action == "hold_previous":
            if not actual or key not in previous or actual["id"] != previous[key]["id"]:
                raise RuntimeError(f"Active champion unexpectedly changed for {key}")
        elif actual is not None:
            raise RuntimeError(f"Expected fallback, found active model for {key}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-id", type=str, required=True,
                        help="Exact UUID of a pre-registered, evaluated candidate run")
    parser.add_argument("--apply", action="store_true",
                        help="Apply the atomic plan only after successful server preflight")
    parser.add_argument("--receipt-dir", type=Path, default=Path("training/artifacts/release"))
    args = parser.parse_args()
    run_id = str(UUID(args.run_id))
    sb = get_client()
    candidates = (
        sb.table("model_registry").select(REGISTRY_FIELDS)
        .eq("run_id", run_id).execute().data or []
    )
    current = (
        sb.table("model_registry").select(REGISTRY_FIELDS)
        .eq("is_active", True).execute().data or []
    )
    plan = build_standard_plan(POOLED_PROVINCE_IDS, candidates, current)
    to_activate = [r for r in plan if r["action"] == "activate_candidate"]
    receipt: dict[str, Any] = {
        "run_id": run_id, "mode": "apply" if args.apply else "preview",
        "candidate_registry_rows": len(candidates),
        "activate": len(to_activate),
        "hold": sum(r["action"] == "hold_previous" for r in plan),
        "fallback": sum(r["action"].startswith("deactivate_to") for r in plan),
        "plan": plan, "production_mutated": False,
    }
    if not to_activate:
        receipt["blocked"] = "No registered, validated and portable candidate to activate"
    else:
        index = {(r["province_id"], r["task_type"]): r for r in candidates}
        if args.apply:
            for item in to_activate:
                _verify_blob_sha(sb, index[(item["province_id"], item["task_type"])])
        preflight = preflight_activation_plan(
            sb, run_id=run_id, plan=plan, required_provinces=20
        )
        receipt["preflight"] = preflight
        if args.apply:
            applied = apply_activation_plan(
                sb, run_id=run_id, plan=plan, required_provinces=20
            )
            receipt["activation_id"] = applied["activation_id"]
            try:
                _readback(sb, plan, run_id, current)
            except Exception:
                rollback_activation(sb, activation_id=str(applied["activation_id"]))
                raise
            receipt["production_mutated"] = True

    args.receipt_dir.mkdir(parents=True, exist_ok=True)
    out = args.receipt_dir / f"activation_{run_id}.json"
    out.write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(receipt, ensure_ascii=False, indent=2))
    return 1 if receipt.get("blocked") else 0


if __name__ == "__main__":
    raise SystemExit(main())
