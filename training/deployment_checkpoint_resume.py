"""Restore an already-audited PM2.5 deployment checkpoint without retraining.

This helper is intentionally deployment-only. It never accepts a newly rebuilt
chronological split as evidence for an older fitted model. Instead it restores
the saved ``artifacts`` checkpoint, validates the split embedded in that
checkpoint against its own stored fingerprint, verifies the complete 40-row
candidate set and serving artifact hashes, and returns the exact state needed
by the Storage/Registry activation cell.

The purpose is to make Colab restarts deterministic: once an audited artifact
checkpoint exists, changing upstream source rows must not force Regression or
Classification to be fitted again merely to deploy that already-reviewed run.
"""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Callable

import joblib


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def restore_deployment_artifacts_checkpoint(
    checkpoint_path: Path,
    *,
    expected_schema: str,
    expected_code_sha: str,
    split_fingerprint: Callable[[object], str],
    required_provinces: int = 20,
) -> dict:
    """Return exact activation state from a completed deployment checkpoint.

    The checkpoint is self-contained: its embedded ``result.split`` is the
    chronological split that produced the trained models. A current/rebuilt
    split is deliberately ignored because it is not valid evidence for those
    already-fitted models.
    """
    checkpoint_path = Path(checkpoint_path)
    if not checkpoint_path.exists():
        raise RuntimeError(
            f"Deployment artifact checkpoint is missing: {checkpoint_path}. "
            "Training is required only when this audited checkpoint is absent."
        )

    payload = joblib.load(checkpoint_path)
    if not isinstance(payload, dict):
        raise RuntimeError("Deployment artifact checkpoint is not a mapping")
    if payload.get("schema") != expected_schema:
        raise RuntimeError("Deployment artifact checkpoint schema mismatch")
    if payload.get("approved_code_sha") != expected_code_sha:
        raise RuntimeError("Deployment artifact checkpoint belongs to another reviewed commit")
    if payload.get("stage") != "artifacts":
        raise RuntimeError("Deployment checkpoint is not the artifacts stage")

    required = (
        "config",
        "selected_provinces",
        "regression",
        "classification",
        "eligibility",
        "gate_summary",
        "run_id",
        "result",
        "artifacts",
        "run_summary",
        "summary_path",
    )
    missing = [name for name in required if name not in payload]
    if missing:
        raise RuntimeError(
            "Deployment artifact checkpoint is incomplete: " + ", ".join(missing)
        )

    result = payload["result"]
    stored_fingerprint = str(payload.get("split_fingerprint") or "")
    if not stored_fingerprint:
        raise RuntimeError("Deployment artifact checkpoint has no split fingerprint")
    actual_fingerprint = split_fingerprint(result.split)
    if actual_fingerprint != stored_fingerprint:
        raise RuntimeError(
            "Embedded deployment split fingerprint does not match the audited checkpoint"
        )

    selected_provinces = tuple(payload["selected_provinces"])
    if len(selected_provinces) != required_provinces or len(set(selected_provinces)) != required_provinces:
        raise RuntimeError(
            f"Deployment checkpoint must contain {required_provinces} distinct provinces"
        )
    if str(payload["run_id"]) != str(result.run_id):
        raise RuntimeError("Deployment run_id differs from the saved PooledResult")

    rows = list(result.registry_rows)
    if len(rows) != required_provinces * 2:
        raise RuntimeError(
            f"Deployment checkpoint must contain {required_provinces * 2} Registry rows"
        )
    task_keys = {
        (str(row.get("province_id")), str(row.get("task_type"))) for row in rows
    }
    expected_keys = {
        (province_id, task_type)
        for province_id in selected_provinces
        for task_type in ("regression", "classification")
    }
    if task_keys != expected_keys:
        raise RuntimeError("Deployment Registry rows do not cover every province/task exactly once")
    if not all(
        bool(row.get("eligibility_status"))
        and row.get("evidence_status") == "validated"
        for row in rows
    ):
        raise RuntimeError(
            "Deployment checkpoint contains an ineligible/unvalidated candidate; fallback remains active"
        )

    gate_summary = payload["gate_summary"]
    if not isinstance(gate_summary, dict) or gate_summary.get("dual_model_gate") is not True:
        raise RuntimeError(
            "Saved dual-model deployment gate is not eligible; fallback remains active"
        )

    regression = payload["regression"]
    classification = payload["classification"]
    if len(regression.province_metrics) != required_provinces:
        raise RuntimeError("Saved Regression evidence does not cover all provinces")
    if len(classification.province_metrics) != required_provinces:
        raise RuntimeError("Saved Classification evidence does not cover all provinces")

    artifacts = payload["artifacts"]
    if set(artifacts.get("regression", {})) != set(selected_provinces):
        raise RuntimeError("Saved Regression artifacts do not cover all provinces")
    if set(artifacts.get("classification", {})) != {"pooled"}:
        raise RuntimeError("Saved Classification artifact is missing")

    # Serving runtime bytes are the production-critical evidence. Verify every
    # runtime before any Storage/Registry write. Native teacher artifacts need
    # only exist locally; the oversized RF teacher remains on Drive on Free.
    for task_type in ("regression", "classification"):
        for artifact_key, paths in artifacts[task_type].items():
            runtime_path = Path(paths["runtime_path"])
            native_path = Path(paths["native_path"])
            if not runtime_path.exists() or runtime_path.stat().st_size <= 0:
                raise RuntimeError(f"Missing serving runtime: {task_type}/{artifact_key}")
            if _sha256_file(runtime_path) != str(paths["runtime_sha256"]):
                raise RuntimeError(f"Serving runtime checksum mismatch: {task_type}/{artifact_key}")
            if not native_path.exists() or native_path.stat().st_size <= 0:
                raise RuntimeError(f"Missing native training artifact: {task_type}/{artifact_key}")

    return {
        name: payload[name]
        for name in required
    } | {
        "split": result.split,
        "training_split_fingerprint": stored_fingerprint,
        "deployment_resume_mode": "audited_artifacts_checkpoint",
    }
