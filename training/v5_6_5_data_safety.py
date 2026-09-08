"""Fresh-data audit and snapshot-safe checkpoint orchestration for PM2.5 v5.6.5.

This module deliberately does not change the reviewed v5.6.4 model logic,
features, hyperparameters, gating, champion/challenger comparison, registry
writes, activation rules, or Production artifacts. It wraps the already-
installed v5.6.4 trainer with data-management safeguards only:

* fingerprint the exact Supabase training snapshot used by a run;
* report freshness, missingness, lineage and per-province coverage;
* namespace optional Colab checkpoints by data snapshot + code + tuning revision;
* refuse stale checkpoint reuse when any contract component differs; and
* emit report-only visualization sidecars from already-evaluated model objects.

Production monthly retraining is unaffected unless this v5.6.5 entrypoint is
explicitly selected. The current v5.6.4 entrypoint remains unchanged.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Any, Callable

import joblib
import numpy as np
import pandas as pd

from training.dual_model_config import (
    POOLED_FEATURE_COLUMNS,
    POOLED_FEATURE_VERSION,
    POOLED_PROVINCE_IDS,
)
from training.v5_6_4_stability_hotfix import TUNING_REVISION

SNAPSHOT_SCHEMA = "pm25-training-snapshot-v1"
CHECKPOINT_SCHEMA = "pm25-task-checkpoint-v1"
DATA_SAFETY_REVISION = "v5.6.5-fresh-data-safety-v1"

# Source columns define the content identity of one training snapshot. Derived
# features are rebuilt deterministically by the existing v5.6.4 pipeline and
# therefore are not required to identify whether source data changed.
SNAPSHOT_SOURCE_COLUMNS = (
    "province_id",
    "date",
    "trusted_hours",
    "trusted_sources",
    "data_origin",
    "lineage_version",
    "air_request_id",
    "weather_request_id",
    "pm25_mean",
    "temp_mean",
    "humidity_mean",
    "wind_speed_mean",
    "precip_total",
)
QUALITY_VALUE_COLUMNS = (
    "pm25_mean",
    "temp_mean",
    "humidity_mean",
    "wind_speed_mean",
    "precip_total",
)

_CURRENT_SNAPSHOT: dict[str, Any] | None = None


def _json_digest(payload: Any) -> str:
    encoded = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
        default=str,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _stable_scalar(value: Any) -> Any:
    if value is None or value is pd.NA:
        return None
    if isinstance(value, pd.Timestamp):
        return value.normalize().date().isoformat()
    if isinstance(value, np.datetime64):
        return pd.Timestamp(value).normalize().date().isoformat()
    if isinstance(value, (np.floating, float)):
        if not np.isfinite(float(value)):
            return None
        return format(float(value), ".12g")
    if isinstance(value, (np.integer, int)):
        return int(value)
    if isinstance(value, (list, tuple, set)):
        return [_stable_scalar(item) for item in value]
    if pd.isna(value):
        return None
    return str(value)


def _source_content_sha256(frame: pd.DataFrame) -> tuple[str, tuple[str, ...]]:
    columns = tuple(column for column in SNAPSHOT_SOURCE_COLUMNS if column in frame.columns)
    if "province_id" not in columns or "date" not in columns or "pm25_mean" not in columns:
        raise RuntimeError(
            "training snapshot cannot be fingerprinted because province_id/date/pm25_mean "
            "are not all present"
        )
    ordered = frame.loc[:, list(columns)].copy()
    ordered["date"] = pd.to_datetime(ordered["date"], errors="raise").dt.normalize()
    ordered = ordered.sort_values(["province_id", "date"]).reset_index(drop=True)

    hasher = hashlib.sha256()
    hasher.update((SNAPSHOT_SCHEMA + "\n").encode("utf-8"))
    hasher.update(("|".join(columns) + "\n").encode("utf-8"))
    for row in ordered.itertuples(index=False, name=None):
        canonical = [_stable_scalar(value) for value in row]
        hasher.update(
            (json.dumps(canonical, separators=(",", ":"), ensure_ascii=True) + "\n").encode(
                "utf-8"
            )
        )
    return hasher.hexdigest(), columns


def _province_date_summary(frame: pd.DataFrame) -> tuple[dict[str, int], dict[str, str], dict[str, str]]:
    grouped = frame.groupby("province_id", sort=True)["date"]
    counts = {str(key): int(value) for key, value in grouped.nunique().items()}
    starts = {
        str(key): pd.Timestamp(value).date().isoformat()
        for key, value in grouped.min().items()
    }
    ends = {
        str(key): pd.Timestamp(value).date().isoformat()
        for key, value in grouped.max().items()
    }
    return counts, starts, ends


def build_training_snapshot(
    observed: pd.DataFrame,
    database_audit: dict[str, Any],
    *,
    code_sha: str | None = None,
) -> dict[str, Any]:
    """Build a stable identity + quality report without mutating training rows."""
    if observed.empty:
        raise RuntimeError("cannot fingerprint an empty training dataset")

    frame = observed.copy()
    frame["date"] = pd.to_datetime(frame["date"], errors="raise").dt.normalize()
    actual_provinces = tuple(sorted(str(value) for value in frame["province_id"].unique()))
    expected_provinces = tuple(sorted(str(value) for value in POOLED_PROVINCE_IDS))
    if actual_provinces != expected_provinces:
        raise RuntimeError(
            "fresh-data snapshot province contract mismatch: "
            f"expected={expected_provinces} actual={actual_provinces}"
        )
    duplicates = int(frame.duplicated(["province_id", "date"], keep=False).sum())
    if duplicates:
        raise RuntimeError(
            f"fresh-data snapshot contains {duplicates} duplicate province/date rows"
        )

    content_sha256, fingerprint_columns = _source_content_sha256(frame)
    counts, starts, ends = _province_date_summary(frame)
    data_start = pd.Timestamp(frame["date"].min()).date().isoformat()
    data_end = pd.Timestamp(frame["date"].max()).date().isoformat()
    latest_dates = [pd.Timestamp(value) for value in ends.values()]
    latest_spread_days = int((max(latest_dates) - min(latest_dates)).days)

    missing_fraction = {
        column: float(pd.to_numeric(frame[column], errors="coerce").isna().mean())
        for column in QUALITY_VALUE_COLUMNS
        if column in frame.columns
    }
    trusted_hours = pd.to_numeric(frame.get("trusted_hours"), errors="coerce")
    trusted_below_18 = int((trusted_hours < 18).fillna(False).sum()) if trusted_hours is not None else 0

    available_features = [column for column in POOLED_FEATURE_COLUMNS if column in frame.columns]
    if available_features:
        feature_complete = frame[available_features].notna().all(axis=1)
        feature_complete_rows = int(feature_complete.sum())
        feature_complete_rate = float(feature_complete.mean())
    else:
        feature_complete_rows = 0
        feature_complete_rate = 0.0

    warnings: list[str] = []
    if latest_spread_days > 1:
        warnings.append(f"province_latest_date_spread:{latest_spread_days}d")
    for column, fraction in missing_fraction.items():
        if fraction > 0:
            warnings.append(f"missing_{column}:{fraction:.6f}")
    if trusted_below_18:
        warnings.append(f"trusted_hours_below_18:{trusted_below_18}")
    if feature_complete_rate < 0.95:
        warnings.append(f"feature_complete_rate:{feature_complete_rate:.6f}")

    requested_code_sha = (
        code_sha
        or os.environ.get("PM25_APPROVED_CODE_SHA", "").strip()
        or os.environ.get("GITHUB_SHA", "").strip()
        or "unknown"
    )
    identity = {
        "schema": SNAPSHOT_SCHEMA,
        "source_of_truth": database_audit.get("source_of_truth"),
        "feature_version": POOLED_FEATURE_VERSION,
        "content_sha256": content_sha256,
        "row_count": int(len(frame)),
        "province_count": int(len(actual_provinces)),
        "data_start": data_start,
        "data_end": data_end,
        "rows_by_province": counts,
        "latest_date_by_province": ends,
        "fingerprint_columns": list(fingerprint_columns),
    }
    snapshot_id = _json_digest(identity)
    checkpoint_contract = {
        "snapshot_id": snapshot_id,
        "feature_version": POOLED_FEATURE_VERSION,
        "code_sha": requested_code_sha,
        "tuning_revision": TUNING_REVISION,
    }
    checkpoint_contract_id = _json_digest(checkpoint_contract)

    return {
        **identity,
        "snapshot_id": snapshot_id,
        "data_safety_revision": DATA_SAFETY_REVISION,
        "code_sha": requested_code_sha,
        "tuning_revision": TUNING_REVISION,
        "checkpoint_contract_id": checkpoint_contract_id,
        "checkpoint_namespace": (
            f"{POOLED_FEATURE_VERSION}/{data_end}/{snapshot_id[:16]}/"
            f"{checkpoint_contract_id[:16]}"
        ),
        "checkpoint_policy": "resume_only_when_snapshot_feature_code_and_tuning_match",
        "stale_checkpoint_resume_allowed": False,
        "fresh_data_change_forces_new_checkpoint_namespace": True,
        "quality": {
            "rows": int(len(frame)),
            "provinces": int(len(actual_provinces)),
            "date_start": data_start,
            "date_end": data_end,
            "rows_by_province": counts,
            "start_date_by_province": starts,
            "latest_date_by_province": ends,
            "province_latest_date_spread_days": latest_spread_days,
            "missing_fraction": missing_fraction,
            "trusted_hours_below_18_rows": trusted_below_18,
            "feature_columns_present": int(len(available_features)),
            "feature_complete_rows": feature_complete_rows,
            "feature_complete_rate": feature_complete_rate,
            "warnings": warnings,
            "hard_contract_passed": True,
        },
    }


def _split_signature(split: Any) -> str:
    payload: dict[str, Any] = {}
    for name in ("train", "validation", "test"):
        frame = getattr(split, name)
        dates = pd.to_datetime(frame["date"], errors="raise").dt.normalize()
        payload[name] = {
            "rows": int(len(frame)),
            "origin_dates": int(dates.nunique()),
            "date_start": pd.Timestamp(dates.min()).date().isoformat(),
            "date_end": pd.Timestamp(dates.max()).date().isoformat(),
            "provinces": sorted(str(value) for value in frame["province_id"].unique()),
            "horizons": sorted(
                int(value) for value in frame["forecast_horizon_days"].unique()
            ),
        }
    payload["dropped_embargo_dates"] = [str(value) for value in split.dropped_embargo_dates]
    return _json_digest(payload)


def _checkpoint_enabled() -> bool:
    return bool(os.environ.get("PM25_CHECKPOINT_ROOT", "").strip())


def _resume_enabled() -> bool:
    return os.environ.get("PM25_RESUME_SNAPSHOT_CHECKPOINTS", "0").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def _checkpoint_path(task_type: str, split_signature: str) -> Path | None:
    if not _checkpoint_enabled() or _CURRENT_SNAPSHOT is None:
        return None
    root = Path(os.environ["PM25_CHECKPOINT_ROOT"]).expanduser()
    namespace = Path(*str(_CURRENT_SNAPSHOT["checkpoint_namespace"]).split("/"))
    return root / namespace / f"{task_type}-{split_signature[:16]}.joblib"


def _checkpoint_contract(task_type: str, split_signature: str) -> dict[str, Any]:
    if _CURRENT_SNAPSHOT is None:
        raise RuntimeError("training snapshot was not prepared before checkpoint access")
    return {
        "schema": CHECKPOINT_SCHEMA,
        "task_type": task_type,
        "snapshot_id": _CURRENT_SNAPSHOT["snapshot_id"],
        "checkpoint_contract_id": _CURRENT_SNAPSHOT["checkpoint_contract_id"],
        "feature_version": POOLED_FEATURE_VERSION,
        "code_sha": _CURRENT_SNAPSHOT["code_sha"],
        "tuning_revision": TUNING_REVISION,
        "split_signature": split_signature,
    }


def _load_checkpoint(path: Path, contract: dict[str, Any]) -> Any | None:
    if not path.exists() or not _resume_enabled():
        return None
    payload = joblib.load(path)
    if not isinstance(payload, dict) or payload.get("contract") != contract:
        raise RuntimeError(
            f"refusing stale/incompatible checkpoint: {path}; exact v5.6.5 contract mismatch"
        )
    task = payload.get("task")
    if getattr(task, "task_type", None) != contract["task_type"]:
        raise RuntimeError(f"checkpoint task type mismatch: {path}")
    return task


def _save_checkpoint(path: Path, contract: dict[str, Any], task: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    joblib.dump({"contract": contract, "task": task}, temporary, compress=3)
    temporary.replace(path)


def _write_snapshot_report(config: Any) -> None:
    if _CURRENT_SNAPSHOT is None:
        return
    output = Path(config.artifact_directory)
    output.mkdir(parents=True, exist_ok=True)
    (output / "v5_6_5_training_snapshot.json").write_text(
        json.dumps(_CURRENT_SNAPSHOT, ensure_ascii=False, indent=2, default=str) + "\n",
        encoding="utf-8",
    )


def _regression_feature_importance(task: Any) -> list[dict[str, Any]]:
    models = task.model if isinstance(task.model, dict) else {}
    vectors: list[np.ndarray] = []
    for model in models.values():
        values: np.ndarray | None = None
        try:
            values = np.asarray(
                model.booster_.feature_importance(importance_type="gain"), dtype=float
            )
        except Exception:
            try:
                values = np.asarray(model.feature_importances_, dtype=float)
            except Exception:
                values = None
        if values is None or len(values) != len(POOLED_FEATURE_COLUMNS):
            continue
        total = float(np.sum(values))
        vectors.append(values / total if total > 0 else values)
    if not vectors:
        return []
    mean_values = np.mean(np.vstack(vectors), axis=0)
    return [
        {"feature": feature, "importance": float(value)}
        for feature, value in sorted(
            zip(POOLED_FEATURE_COLUMNS, mean_values, strict=True),
            key=lambda item: item[1],
            reverse=True,
        )
    ]


def _classification_feature_importance(task: Any) -> list[dict[str, Any]]:
    model = task.model
    try:
        values = np.asarray(model.feature_importances_, dtype=float)
    except Exception:
        return []
    if len(values) != len(POOLED_FEATURE_COLUMNS):
        return []
    total = float(np.sum(values))
    if total > 0:
        values = values / total
    return [
        {"feature": feature, "importance": float(value)}
        for feature, value in sorted(
            zip(POOLED_FEATURE_COLUMNS, values, strict=True),
            key=lambda item: item[1],
            reverse=True,
        )
    ]


def _write_regression_visualization(task: Any, split: Any, config: Any) -> None:
    if task.test_predictions is None:
        return
    output = Path(config.artifact_directory)
    output.mkdir(parents=True, exist_ok=True)
    test = split.test.reset_index(drop=True)
    predictions = np.asarray(task.test_predictions, dtype=float)
    if len(predictions) != len(test):
        raise RuntimeError("v5.6.5 regression visualization prediction length mismatch")
    d1 = test["forecast_horizon_days"].to_numpy(dtype=int) == 1
    rows = test.loc[d1, ["province_id", "date", "target_pm25"]].copy()
    rows["predicted_pm25"] = predictions[d1]
    province_metrics = [
        {
            "province_id": province_id,
            "mae": float(metrics.get("mae", np.nan)),
            "rmse": float(metrics.get("rmse", np.nan)),
            "r2": float(metrics.get("r2", np.nan)),
            "skill_vs_persistence": float(metrics.get("skill_vs_persistence", np.nan)),
            "eligible": bool(metrics.get("eligible", False)),
        }
        for province_id, metrics in sorted(task.province_metrics.items())
    ]
    payload = {
        "data_safety_revision": DATA_SAFETY_REVISION,
        "snapshot_id": _CURRENT_SNAPSHOT.get("snapshot_id") if _CURRENT_SNAPSHOT else None,
        "d1_actual_predicted": [
            {
                "province_id": str(row.province_id),
                "date": pd.Timestamp(row.date).date().isoformat(),
                "actual_pm25": float(row.target_pm25),
                "predicted_pm25": float(row.predicted_pm25),
            }
            for row in rows.itertuples(index=False)
        ],
        "province_metrics": province_metrics,
        "feature_importance": _regression_feature_importance(task),
    }
    (output / "v5_6_5_regression_visualization.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, default=str) + "\n",
        encoding="utf-8",
    )


def _write_classification_visualization(task: Any, config: Any) -> None:
    output = Path(config.artifact_directory)
    output.mkdir(parents=True, exist_ok=True)
    payload = {
        "data_safety_revision": DATA_SAFETY_REVISION,
        "snapshot_id": _CURRENT_SNAPSHOT.get("snapshot_id") if _CURRENT_SNAPSHOT else None,
        "confusion_matrix": task.test_metrics.get("confusion_matrix"),
        "per_class": task.test_metrics.get("per_class"),
        "feature_importance": _classification_feature_importance(task),
    }
    (output / "v5_6_5_classification_visualization.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, default=str) + "\n",
        encoding="utf-8",
    )


def _task_wrapper(
    task_type: str,
    trainer: Callable[..., Any],
) -> Callable[..., Any]:
    def wrapped(split: Any, config: Any, *args: Any, **kwargs: Any) -> Any:
        signature = _split_signature(split)
        contract = _checkpoint_contract(task_type, signature)
        path = _checkpoint_path(task_type, signature)
        restored = _load_checkpoint(path, contract) if path is not None else None
        if restored is not None:
            task = restored
            checkpoint_status = "restored_exact_snapshot"
            print(
                json.dumps(
                    {
                        "v5_6_5_checkpoint": {
                            "task": task_type,
                            "status": checkpoint_status,
                            "path": str(path),
                            "snapshot_id": contract["snapshot_id"],
                        }
                    }
                ),
                flush=True,
            )
        else:
            task = trainer(split, config, *args, **kwargs)
            checkpoint_status = "trained_fresh"
            if path is not None:
                _save_checkpoint(path, contract, task)
                print(
                    json.dumps(
                        {
                            "v5_6_5_checkpoint": {
                                "task": task_type,
                                "status": "saved_exact_snapshot",
                                "path": str(path),
                                "snapshot_id": contract["snapshot_id"],
                            }
                        }
                    ),
                    flush=True,
                )
        task.parameters.setdefault("v5_6_5_data_safety", {})
        task.parameters["v5_6_5_data_safety"].update(
            {
                "revision": DATA_SAFETY_REVISION,
                "snapshot_id": contract["snapshot_id"],
                "checkpoint_contract_id": contract["checkpoint_contract_id"],
                "checkpoint_status": checkpoint_status,
                "split_signature": signature,
            }
        )
        _write_snapshot_report(config)
        if task_type == "regression":
            _write_regression_visualization(task, split, config)
        elif task_type == "classification":
            _write_classification_visualization(task, config)
        return task

    return wrapped


def install_into_monthly_retrainer() -> None:
    """Wrap the already-installed v5.6.4 trainer without changing model logic."""
    import training.monthly_auto_retrain as monthly

    original_prepare = monthly.prepare_db_training_data
    original_regression = monthly.train_regression
    original_classification = monthly.train_classification

    def prepare_with_snapshot(sb: Any, province_metadata: pd.DataFrame):
        global _CURRENT_SNAPSHOT
        observed, audit = original_prepare(sb, province_metadata)
        snapshot = build_training_snapshot(observed, audit)
        _CURRENT_SNAPSHOT = snapshot
        enriched = dict(audit)
        enriched["training_snapshot"] = snapshot
        print(
            json.dumps(
                {
                    "v5_6_5_training_snapshot": {
                        "snapshot_id": snapshot["snapshot_id"],
                        "data_start": snapshot["data_start"],
                        "data_end": snapshot["data_end"],
                        "rows": snapshot["row_count"],
                        "provinces": snapshot["province_count"],
                        "checkpoint_namespace": snapshot["checkpoint_namespace"],
                        "quality_warnings": snapshot["quality"]["warnings"],
                    }
                },
                ensure_ascii=False,
            ),
            flush=True,
        )
        return observed, enriched

    monthly.prepare_db_training_data = prepare_with_snapshot
    monthly.train_regression = _task_wrapper("regression", original_regression)
    monthly.train_classification = _task_wrapper("classification", original_classification)
