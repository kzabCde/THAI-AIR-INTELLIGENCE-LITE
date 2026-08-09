#!/usr/bin/env python3
"""Build reviewed v5.6.4 Colab notebooks from the checked-in templates."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PRODUCTION_TEMPLATE = (
    ROOT / "training/templates/train_all_6_models_pm25_production_template.ipynb"
)
SAFE_NOTEBOOKS = (
    ROOT / "training/train_dual_models_pm25.ipynb",
    ROOT / "training/train_all_6_models_pm25.ipynb",
)
TRAINING_CHECKPOINT_COMPATIBILITY_SHA = (
    "b4436227a2471e65c40fae1515deabb3bf880c7f"
)


def _source(text: str) -> list[str]:
    lines = text.strip("\n").splitlines(keepends=True)
    if lines and not lines[-1].endswith("\n"):
        lines[-1] += "\n"
    return lines


def _cell(notebook: dict, cell_id: str) -> dict:
    for cell in notebook["cells"]:
        if cell.get("metadata", {}).get("id") == cell_id:
            return cell
    raise KeyError(f"Notebook is missing cell {cell_id!r}")


def _set(notebook: dict, cell_id: str, text: str) -> None:
    _cell(notebook, cell_id)["source"] = _source(text)


def _clear_outputs(notebook: dict) -> None:
    for cell in notebook["cells"]:
        if cell.get("cell_type") == "code":
            cell["execution_count"] = None
            cell["outputs"] = []


def _has_cell(notebook: dict, cell_id: str) -> bool:
    return any(
        cell.get("metadata", {}).get("id") == cell_id
        for cell in notebook["cells"]
    )


def _write_notebook(notebook: dict, output: Path) -> None:
    _clear_outputs(notebook)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(notebook, ensure_ascii=False, indent=1) + "\n",
        encoding="utf-8",
    )


def _build_current_production(
    notebook: dict,
    approved_sha: str,
    output: Path,
) -> None:
    """Build the reviewed 17-cell Production notebook topology."""
    metadata = notebook.setdefault("metadata", {})
    metadata.pop("accelerator", None)
    metadata["notebook_version"] = "5.6.4-production"
    metadata["approved_code_sha"] = approved_sha
    metadata.setdefault("colab", {})["machine_shape"] = "hm"
    _set(
        notebook,
        "intro",
        """
# Thai Air Intelligence — Production Dual-Model PM2.5 v5.6.4

This reviewed Colab notebook trains 20 province-local residual LightGBM regressors and one pooled Random Forest classifier. Validation and Test each contain exactly 365 origin dates, with a seven-day embargo at both chronological boundaries and at least 90 training origin dates.

The strict research gate remains regression MAE Skill versus Persistence of at least 4.5% globally and for every province. The reviewed operational policy permits only TH-34 to deploy conditionally at Skill 4.45%–<4.50% when it is the sole strict failure, its only failure reason is `skill_below_threshold`, Validation and Test each contain 365 rows, and MAE remains below Persistence. The notebook records strict and deployment eligibility separately; it never reports a conditional deployment as a strict research pass. Classification requires Test Accuracy ≥ 0.65, Macro F1 ≥ 0.50, Balanced Accuracy ≥ 0.50, Weighted F1 ≥ 0.60, and Recall ≥ 0.35 for Classes 4 and 5 with at least five examples each.

Open-Meteo CAMS PM2.5 and Historical Weather data are used only as an in-memory archive before the first trusted database date. Successful archive responses and training checkpoints persist under Google Drive so a replacement runtime resumes completed work. The archive is never written to Supabase, and database rows win at the boundary.

Run Regression and Classification as separate phases. v5.6.4 reuses the reviewed v5.6.3 Training checkpoints pinned to their original code SHA, while writing eligibility, artifacts, activation, and forecast state only under the new deployment SHA. Promotion remains all-or-nothing: only after both phases satisfy the reviewed deployment policy for all 20 provinces does the notebook create 40 inactive candidates, invoke one atomic activation RPC, generate seven forecast days, and verify 40 active rows plus 140 forecast rows.

Recommended execution: run Cells 1–9 for the Regression phase. For a fresh Classification runtime, rerun Cells 1–5 and then Cell 10; it restores the split and Regression result from Drive. Run Cells 11–16 only after both phase summaries are complete. Do not use `Run all` for the first long training attempt.

Use a CPU High-RAM runtime. LightGBM and Random Forest are configured for CPU parallelism; selecting a GPU wastes the separate Colab GPU quota without accelerating this pipeline.

Required Colab Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ML_SECRET`, and either `ML_FORECAST_URL` or `WEBSITE_URL`.
""",
    )
    _set(
        notebook,
        "configuration",
        f"""
# 1. Reviewed Production configuration — v5.6.4
import os

os.environ["CUDA_VISIBLE_DEVICES"] = ""
REGISTER = True
ACTIVATE = True
RUN_FORECAST = True
PRODUCTION_APPROVAL = "APPROVED_RESIDUAL_DUAL_MODEL_V5_6_4_CONDITIONAL_TH34"
APPROVED_CODE_SHA = "{approved_sha}"
TRAINING_CHECKPOINT_COMPATIBILITY_SHA = "{TRAINING_CHECKPOINT_COMPATIBILITY_SHA}"

PROVINCE = "all"
MINIMUM_ROWS = 834  # 90 train + 365 validation + 365 test + 14 embargo
CV_SPLITS = 5
ALLOWED_SOURCES = {{"open-meteo"}}
FORECAST_HORIZON_DAYS = 7
PRODUCTION_REQUIRED_PROVINCES = 20
REGRESSION_MINIMUM_SKILL = 0.045
REGRESSION_CONDITIONAL_FLOOR = 0.0445
REGRESSION_CONDITIONAL_PROVINCES = ("TH-34",)
DRIVE_MOUNT_POINT = "/content/drive"
TRAINING_CHECKPOINT_DIRECTORY = (
    f"{{DRIVE_MOUNT_POINT}}/MyDrive/THAI-AIR-INTELLIGENCE-LITE/"
    f"checkpoints/pm25_v5_6_3/{{TRAINING_CHECKPOINT_COMPATIBILITY_SHA}}"
)
DEPLOYMENT_CHECKPOINT_DIRECTORY = (
    f"{{DRIVE_MOUNT_POINT}}/MyDrive/THAI-AIR-INTELLIGENCE-LITE/"
    f"checkpoints/pm25_v5_6_4/{{APPROVED_CODE_SHA}}"
)
ARTIFACT_DIRECTORY = f"{{DEPLOYMENT_CHECKPOINT_DIRECTORY}}/artifacts"
REQUEST_CPU_HIGH_RAM = True
MINIMUM_RECOMMENDED_RAM_GB = 24.0

USE_IN_MEMORY_ARCHIVE = True
ARCHIVE_START_DATE = "2022-08-01"
ARCHIVE_CHUNK_DAYS = 365
ARCHIVE_PROVINCE_BATCH_SIZE = 5
ARCHIVE_REQUEST_TIMEOUT_SECONDS = 180
ARCHIVE_CACHE_DIRECTORY = f"{{TRAINING_CHECKPOINT_DIRECTORY}}/archive_cache"
ARCHIVE_REQUEST_MIN_INTERVAL_SECONDS = 15.0
ARCHIVE_MAX_ATTEMPTS = 8
ARCHIVE_MAX_BACKOFF_SECONDS = 300.0
MINIMUM_ANNUAL_CYCLES = 3
FULL_YEAR_HOLDOUT_DAYS = 365
POOLED_EMBARGO_DAYS = 7
CLASSIFICATION_DEPLOYMENT_THRESHOLDS = {{
    "validation_macro_f1": 0.45,
    "validation_balanced_accuracy": 0.45,
    "test_accuracy": 0.65,
    "test_macro_f1": 0.50,
    "test_balanced_accuracy": 0.50,
    "test_weighted_f1": 0.60,
    "critical_recall": 0.35,
    "critical_support": 5,
}}

if not (REGISTER and ACTIVATE and RUN_FORECAST):
    raise ValueError("v5.6.4 Production requires REGISTER=True, ACTIVATE=True, RUN_FORECAST=True")
if PRODUCTION_APPROVAL != "APPROVED_RESIDUAL_DUAL_MODEL_V5_6_4_CONDITIONAL_TH34":
    raise ValueError("Production approval token is missing")
if len(APPROVED_CODE_SHA) != 40:
    raise ValueError("APPROVED_CODE_SHA must be a reviewed 40-character commit SHA")
if PROVINCE != "all" or PRODUCTION_REQUIRED_PROVINCES != 20:
    raise ValueError("Production activation requires the complete 20-province pool")
if MINIMUM_ROWS < 834 or CV_SPLITS != 5:
    raise ValueError("Production requires at least 834 origin dates and exactly five CV splits")
print({{
    "notebook_version": "5.6.4",
    "mode": "production_register_activate_forecast",
    "approved_code_sha": APPROVED_CODE_SHA,
    "training_checkpoint_compatibility_sha": TRAINING_CHECKPOINT_COMPATIBILITY_SHA,
    "regression_minimum_skill": REGRESSION_MINIMUM_SKILL,
    "regression_conditional_floor": REGRESSION_CONDITIONAL_FLOOR,
    "regression_conditional_provinces": list(REGRESSION_CONDITIONAL_PROVINCES),
    "runtime": "cpu_high_ram_requested",
    "training_checkpoint_directory": TRAINING_CHECKPOINT_DIRECTORY,
    "deployment_checkpoint_directory": DEPLOYMENT_CHECKPOINT_DIRECTORY,
    "archive_database_writes": 0,
}})
""",
    )
    _set(
        notebook,
        "abi_preflight",
        """
# 3. CPU High-RAM and scientific-stack preflight
import os
import platform
from pathlib import Path

import lightgbm
import numpy as np
import pandas as pd
import sklearn
from lightgbm import LGBMRegressor
from sklearn.ensemble import RandomForestClassifier

cpu_count = os.cpu_count() or 1
try:
    runtime_ram_gb = (
        os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES") / (1024 ** 3)
    )
except (AttributeError, OSError, ValueError):
    runtime_ram_gb = float("nan")
gpu_allocated = Path("/dev/nvidia0").exists()
if gpu_allocated:
    print(
        "WARNING: This notebook is CPU-only. Choose Runtime > Change runtime type > "
        "Hardware accelerator: None to preserve GPU quota."
    )
if np.isfinite(runtime_ram_gb) and runtime_ram_gb < MINIMUM_RECOMMENDED_RAM_GB:
    print(
        f"WARNING: {runtime_ram_gb:.1f} GiB RAM detected; CPU High-RAM "
        f"({MINIMUM_RECOMMENDED_RAM_GB:.0f}+ GiB recommended) was requested but is not available."
    )

probe_X = np.asarray([[0.0], [1.0], [2.0], [3.0]], dtype=float)
LGBMRegressor(n_estimators=2, n_jobs=-1, verbose=-1).fit(
    probe_X, probe_X[:, 0]
).predict(probe_X[:1])
RandomForestClassifier(n_estimators=2, n_jobs=-1, random_state=42).fit(
    probe_X, [1, 1, 2, 2]
).predict_proba(probe_X[:1])
print({
    "runtime": "cpu_high_ram",
    "cpu_threads": cpu_count,
    "ram_gib": None if not np.isfinite(runtime_ram_gb) else round(runtime_ram_gb, 1),
    "gpu_allocated_but_disabled": gpu_allocated,
    "python": platform.python_version(),
    "numpy": np.__version__,
    "pandas": pd.__version__,
    "scikit_learn": sklearn.__version__,
    "lightgbm": lightgbm.__version__,
})
print("CPU/scientific environment check passed")
""",
    )
    _set(
        notebook,
        "pipeline_imports",
        """
# 5. Import the exact residual-regression and pooled-classification pipeline
import hashlib
import json
import math
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from google.colab import drive

from api.ml.portable_trees import ARTIFACT_SCHEMA, decode_artifact
from training.deployment_policy import (
    REGRESSION_CONDITIONAL_OVERRIDE_REASON,
    REGRESSION_CONDITIONAL_POLICY,
    evaluate_regression_deployment_policy,
)
from training.dual_model_config import (
    FALLBACK_MODEL_NAME,
    FALLBACK_STRATEGY,
    FALLBACK_WINDOW_DAYS,
    POOLED_FEATURE_COLUMNS,
    POOLED_FEATURE_PROVENANCE,
    POOLED_FEATURE_VERSION,
    POOLED_MINIMUM_ORIGIN_DAYS,
    POOLED_PROVINCE_IDS,
    PipelineConfig,
)
from training.pm25_classes import CLASS_IDS, THRESHOLD_VERSION
from training.train_dual_models import (
    OBSERVED_VIEW,
    _json_safe,
    fetch_observed_rows,
    filter_training_rows,
)
from training.train_pooled_models import (
    CLASSIFICATION_MODEL_NAME,
    DIRECT_HORIZONS,
    REGRESSION_MODEL_NAME,
    ClassificationFoldResult,
    PooledResult,
    RegressionProvinceResult,
    build_pooled_examples,
    build_registry_rows,
    fetch_province_metadata,
    get_client,
    pooled_chronological_split,
    save_artifacts,
    train_classification,
    train_regression,
    upload_and_register,
)

drive.mount(DRIVE_MOUNT_POINT, force_remount=False)
TRAINING_CHECKPOINT_ROOT = Path(TRAINING_CHECKPOINT_DIRECTORY)
DEPLOYMENT_CHECKPOINT_ROOT = Path(DEPLOYMENT_CHECKPOINT_DIRECTORY)
TRAINING_STAGE_CHECKPOINT_DIRECTORY = TRAINING_CHECKPOINT_ROOT / "stages"
DEPLOYMENT_STAGE_CHECKPOINT_DIRECTORY = DEPLOYMENT_CHECKPOINT_ROOT / "stages"
REGRESSION_CHECKPOINT_DIRECTORY = (
    TRAINING_CHECKPOINT_ROOT / "regression" / "provinces"
)
CLASSIFICATION_FOLD_CHECKPOINT_DIRECTORY = (
    TRAINING_CHECKPOINT_ROOT / "classification" / "folds"
)
CLASSIFICATION_PROVINCE_CHECKPOINT_DIRECTORY = (
    DEPLOYMENT_CHECKPOINT_ROOT / "classification" / "provinces"
)
for directory in (
    TRAINING_CHECKPOINT_ROOT,
    DEPLOYMENT_CHECKPOINT_ROOT,
    TRAINING_STAGE_CHECKPOINT_DIRECTORY,
    DEPLOYMENT_STAGE_CHECKPOINT_DIRECTORY,
    REGRESSION_CHECKPOINT_DIRECTORY,
    CLASSIFICATION_FOLD_CHECKPOINT_DIRECTORY,
    CLASSIFICATION_PROVINCE_CHECKPOINT_DIRECTORY,
    Path(ARTIFACT_DIRECTORY),
    Path(ARCHIVE_CACHE_DIRECTORY),
):
    directory.mkdir(parents=True, exist_ok=True)

if MINIMUM_ROWS != POOLED_MINIMUM_ORIGIN_DAYS:
    raise ValueError(
        f"Notebook minimum {MINIMUM_ROWS} differs from source policy {POOLED_MINIMUM_ORIGIN_DAYS}"
    )
config = PipelineConfig(
    minimum_rows=POOLED_MINIMUM_ORIGIN_DAYS,
    minimum_validation_rows=FULL_YEAR_HOLDOUT_DAYS,
    minimum_test_rows=FULL_YEAR_HOLDOUT_DAYS,
    cv_splits=CV_SPLITS,
    regression_minimum_skill=REGRESSION_MINIMUM_SKILL,
    classifier_minimum_macro_f1=CLASSIFICATION_DEPLOYMENT_THRESHOLDS["test_macro_f1"],
    classifier_minimum_critical_recall=CLASSIFICATION_DEPLOYMENT_THRESHOLDS["critical_recall"],
    critical_class_minimum_support=CLASSIFICATION_DEPLOYMENT_THRESHOLDS["critical_support"],
    artifact_directory=Path(ARTIFACT_DIRECTORY),
)
config.validate()
context_provinces = tuple(POOLED_PROVINCE_IDS)
selected_provinces = context_provinces if PROVINCE == "all" else (PROVINCE,)
if any(province_id not in POOLED_PROVINCE_IDS for province_id in selected_provinces):
    raise ValueError(f"Unknown province selection: {selected_provinces}")
print({
    "regression": REGRESSION_MODEL_NAME,
    "classification": CLASSIFICATION_MODEL_NAME,
    "fallback": {
        "model": FALLBACK_MODEL_NAME,
        "strategy": FALLBACK_STRATEGY,
        "window_days": FALLBACK_WINDOW_DAYS,
    },
    "features": len(POOLED_FEATURE_COLUMNS),
    "feature_version": POOLED_FEATURE_VERSION,
    "provinces": len(selected_provinces),
    "direct_horizons": list(DIRECT_HORIZONS),
    "register": REGISTER,
    "activate": ACTIVATE,
})

TRAINING_CHECKPOINT_SCHEMA = "pm25-residual-v5.6.3"
DEPLOYMENT_CHECKPOINT_SCHEMA = "pm25-deployment-v5.6.4"
TRAINING_CHECKPOINT_STAGES = (
    "split",
    "regression",
    "classification",
)
DEPLOYMENT_CHECKPOINT_STAGES = (
    "eligibility",
    "artifacts",
    "activated",
)
CHECKPOINT_STAGES = TRAINING_CHECKPOINT_STAGES + DEPLOYMENT_CHECKPOINT_STAGES

def _checkpoint_contract(stage):
    if stage in TRAINING_CHECKPOINT_STAGES:
        return (
            TRAINING_STAGE_CHECKPOINT_DIRECTORY,
            TRAINING_CHECKPOINT_SCHEMA,
            TRAINING_CHECKPOINT_COMPATIBILITY_SHA,
        )
    if stage in DEPLOYMENT_CHECKPOINT_STAGES:
        return (
            DEPLOYMENT_STAGE_CHECKPOINT_DIRECTORY,
            DEPLOYMENT_CHECKPOINT_SCHEMA,
            APPROVED_CODE_SHA,
        )
    raise ValueError(f"Unknown checkpoint stage: {stage}")

def _stage_checkpoint_path(stage):
    directory, _, _ = _checkpoint_contract(stage)
    return directory / f"{stage}.joblib"

def _atomic_joblib_dump(payload, target):
    target = Path(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(target.suffix + ".tmp")
    joblib.dump(payload, temporary, compress=3)
    os.replace(temporary, target)

def _load_checkpoint_payload(
    path,
    expected_split_fingerprint=None,
    *,
    expected_schema,
    expected_code_sha,
):
    path = Path(path)
    payload = joblib.load(path)
    if payload.get("schema") != expected_schema:
        raise RuntimeError(f"Checkpoint schema mismatch: {path}")
    if payload.get("approved_code_sha") != expected_code_sha:
        raise RuntimeError(f"Checkpoint belongs to another reviewed commit: {path}")
    if (
        expected_split_fingerprint is not None
        and payload.get("split_fingerprint") != expected_split_fingerprint
    ):
        raise RuntimeError(f"Checkpoint belongs to another chronological split: {path}")
    return payload

def _split_fingerprint(split):
    digest = hashlib.sha256()
    columns = [
        "province_id",
        "date",
        "target_date",
        "forecast_horizon_days",
        "target_pm25",
        "target_air_quality_class",
        *POOLED_FEATURE_COLUMNS,
    ]
    for split_name, frame in (
        ("train", split.train),
        ("validation", split.validation),
        ("test", split.test),
    ):
        digest.update(split_name.encode("utf-8"))
        digest.update(
            pd.util.hash_pandas_object(
                frame.loc[:, columns], index=False, categorize=True
            ).to_numpy().tobytes()
        )
    return digest.hexdigest()

def _save_checkpoint(stage, **state):
    target = _stage_checkpoint_path(stage)
    _, schema, checkpoint_code_sha = _checkpoint_contract(stage)
    payload = {
        "schema": schema,
        "approved_code_sha": checkpoint_code_sha,
        "deployment_code_sha": APPROVED_CODE_SHA,
        "stage": stage,
        "saved_at": datetime.now(timezone.utc).isoformat(),
        **state,
    }
    if "training_split_fingerprint" in globals():
        payload.setdefault("split_fingerprint", training_split_fingerprint)
    _atomic_joblib_dump(payload, target)
    print({"checkpoint": str(target), "stage": stage})

def _restore_stage(stage, required):
    target = _stage_checkpoint_path(stage)
    if not target.exists():
        return False
    _, schema, checkpoint_code_sha = _checkpoint_contract(stage)
    payload = _load_checkpoint_payload(
        target,
        globals().get("training_split_fingerprint"),
        expected_schema=schema,
        expected_code_sha=checkpoint_code_sha,
    )
    missing = [name for name in required if name not in payload]
    if missing:
        raise RuntimeError(f"Checkpoint stage {stage} is missing: {missing}")
    globals().update({name: payload[name] for name in required})
    print({"restored_checkpoint": str(target), "stage": stage})
    return True

def _restore_checkpoint(required):
    restored = {}
    split_target = _stage_checkpoint_path("split")
    _, split_schema, split_code_sha = _checkpoint_contract("split")
    split_payload = (
        _load_checkpoint_payload(
            split_target,
            expected_schema=split_schema,
            expected_code_sha=split_code_sha,
        )
        if split_target.exists()
        else None
    )
    expected_split_fingerprint = (
        split_payload.get("split_fingerprint") if split_payload else None
    )
    if split_payload and "training_split_fingerprint" in split_payload:
        restored["training_split_fingerprint"] = split_payload[
            "training_split_fingerprint"
        ]
    for stage in reversed(CHECKPOINT_STAGES):
        target = _stage_checkpoint_path(stage)
        if not target.exists():
            continue
        _, schema, checkpoint_code_sha = _checkpoint_contract(stage)
        payload = _load_checkpoint_payload(
            target,
            expected_split_fingerprint,
            expected_schema=schema,
            expected_code_sha=checkpoint_code_sha,
        )
        for name in required:
            if name not in restored and name in payload:
                restored[name] = payload[name]
    missing = [name for name in required if name not in restored]
    if missing:
        raise RuntimeError(
            "No compatible persistent checkpoint contains: " + ", ".join(missing)
        )
    globals().update(restored)
    print({
        "training_checkpoint_root": str(TRAINING_CHECKPOINT_ROOT),
        "deployment_checkpoint_root": str(DEPLOYMENT_CHECKPOINT_ROOT),
        "variables": sorted(restored),
    })

def _regression_checkpoint_path(province_id):
    return REGRESSION_CHECKPOINT_DIRECTORY / f"{province_id}.joblib"

def _save_regression_province(result):
    if not isinstance(result, RegressionProvinceResult):
        raise TypeError("Expected RegressionProvinceResult")
    target = _regression_checkpoint_path(result.province_id)
    _atomic_joblib_dump({
        "schema": TRAINING_CHECKPOINT_SCHEMA,
        "approved_code_sha": TRAINING_CHECKPOINT_COMPATIBILITY_SHA,
        "deployment_code_sha": APPROVED_CODE_SHA,
        "kind": "regression_province",
        "province_id": result.province_id,
        "split_fingerprint": training_split_fingerprint,
        "saved_at": datetime.now(timezone.utc).isoformat(),
        "result": result,
    }, target)
    print({"regression_checkpoint": result.province_id, "path": str(target)})

def _load_regression_provinces():
    completed = {}
    for province_id in selected_provinces:
        target = _regression_checkpoint_path(province_id)
        if not target.exists():
            continue
        payload = _load_checkpoint_payload(
            target,
            training_split_fingerprint,
            expected_schema=TRAINING_CHECKPOINT_SCHEMA,
            expected_code_sha=TRAINING_CHECKPOINT_COMPATIBILITY_SHA,
        )
        if payload.get("kind") != "regression_province":
            raise RuntimeError(f"Invalid regression checkpoint: {target}")
        result = payload.get("result")
        if not isinstance(result, RegressionProvinceResult):
            raise RuntimeError(f"Invalid regression result: {target}")
        completed[province_id] = result
    return completed

def _classification_fold_checkpoint_path(fold_index):
    return CLASSIFICATION_FOLD_CHECKPOINT_DIRECTORY / f"fold_{fold_index + 1}.joblib"

def _save_classification_fold(result):
    if not isinstance(result, ClassificationFoldResult):
        raise TypeError("Expected ClassificationFoldResult")
    target = _classification_fold_checkpoint_path(result.fold_index)
    _atomic_joblib_dump({
        "schema": TRAINING_CHECKPOINT_SCHEMA,
        "approved_code_sha": TRAINING_CHECKPOINT_COMPATIBILITY_SHA,
        "deployment_code_sha": APPROVED_CODE_SHA,
        "kind": "classification_cv_fold",
        "fold_index": result.fold_index,
        "split_fingerprint": training_split_fingerprint,
        "saved_at": datetime.now(timezone.utc).isoformat(),
        "result": result,
    }, target)
    print({"classification_fold_checkpoint": result.fold_index + 1, "path": str(target)})

def _load_classification_folds():
    completed = {}
    for fold_index in range(CV_SPLITS):
        target = _classification_fold_checkpoint_path(fold_index)
        if not target.exists():
            continue
        payload = _load_checkpoint_payload(
            target,
            training_split_fingerprint,
            expected_schema=TRAINING_CHECKPOINT_SCHEMA,
            expected_code_sha=TRAINING_CHECKPOINT_COMPATIBILITY_SHA,
        )
        if payload.get("kind") != "classification_cv_fold":
            raise RuntimeError(f"Invalid classification fold checkpoint: {target}")
        result = payload.get("result")
        if not isinstance(result, ClassificationFoldResult):
            raise RuntimeError(f"Invalid classification fold result: {target}")
        completed[fold_index] = result
    return completed

def _save_classification_province_evidence(classification):
    for province_id in selected_provinces:
        target = CLASSIFICATION_PROVINCE_CHECKPOINT_DIRECTORY / f"{province_id}.joblib"
        _atomic_joblib_dump({
            "schema": DEPLOYMENT_CHECKPOINT_SCHEMA,
            "approved_code_sha": APPROVED_CODE_SHA,
            "kind": "classification_province_evidence",
            "province_id": province_id,
            "split_fingerprint": training_split_fingerprint,
            "saved_at": datetime.now(timezone.utc).isoformat(),
            "metrics": classification.province_metrics[province_id],
        }, target)
""",
    )

    fetch_quality = "".join(_cell(notebook, "fetch_quality")["source"])
    fetch_quality = fetch_quality.replace(
        "thai-air-intelligence-shadow-lab-v5.2",
        "thai-air-intelligence-production-v5.6.4",
    )
    _set(notebook, "fetch_quality", fetch_quality)

    _set(
        notebook,
        "split_audit",
        """
# 8. Purged chronological split — every province on one date stays together
split = pooled_chronological_split(examples, config)
split_frames = {"train": split.train, "validation": split.validation, "test": split.test}
split_rows = []
date_sets = {}
for split_name, frame in split_frames.items():
    date_sets[split_name] = set(frame["date"].unique())
    split_rows.append({
        "split": split_name,
        "rows": len(frame),
        "origin_dates": frame["date"].nunique(),
        "first_origin": frame["date"].min(),
        "last_origin": frame["date"].max(),
        "last_target": frame["target_date"].max(),
        "provinces": frame["province_id"].nunique(),
    })
display(pd.DataFrame(split_rows))
split_origin_dates = {
    name: int(frame["date"].nunique()) for name, frame in split_frames.items()
}
print("Embargo dates removed:", len(split.dropped_embargo_dates), split.dropped_embargo_dates)
assert date_sets["train"].isdisjoint(date_sets["validation"])
assert date_sets["train"].isdisjoint(date_sets["test"])
assert date_sets["validation"].isdisjoint(date_sets["test"])
assert split.train["target_date"].max() < split.validation["date"].min()
assert split.validation["target_date"].max() < split.test["date"].min()
if split_origin_dates["validation"] != FULL_YEAR_HOLDOUT_DAYS:
    raise RuntimeError(f"Validation must contain exactly 365 origin dates: {split_origin_dates}")
if split_origin_dates["test"] != FULL_YEAR_HOLDOUT_DAYS:
    raise RuntimeError(f"Test must contain exactly 365 origin dates: {split_origin_dates}")
if len(split.dropped_embargo_dates) != 2 * POOLED_EMBARGO_DAYS:
    raise RuntimeError(
        f"Expected 14 embargo dates, found {len(split.dropped_embargo_dates)}"
    )

training_split_fingerprint = _split_fingerprint(split)
print({"training_split_fingerprint": training_split_fingerprint})
_save_checkpoint(
    "split",
    split=split,
    config=config,
    selected_provinces=selected_provinces,
    archive_audit=archive_audit,
    training_split_fingerprint=training_split_fingerprint,
)
""",
    )
    _set(
        notebook,
        "train_regression",
        """
if "_restore_checkpoint" not in globals():
    raise RuntimeError(
        "Session restarted. Rerun Configuration through Pipeline Imports, then rerun this cell."
    )
if "split" not in globals():
    _restore_checkpoint((
        "split", "config", "selected_provinces", "archive_audit",
        "training_split_fingerprint"
    ))

# 9. Regression phase — resume completed provinces and train only missing LightGBM models
if not _restore_stage("regression", ("regression",)):
    completed_regression_provinces = _load_regression_provinces()
    print({
        "regression_phase": "resume_or_train",
        "completed_provinces": sorted(completed_regression_provinces),
        "remaining_provinces": sorted(
            set(selected_provinces) - set(completed_regression_provinces)
        ),
    })
    regression = train_regression(
        split,
        config,
        province_results=completed_regression_provinces,
        on_province_complete=_save_regression_province,
    )
    _save_checkpoint("regression", regression=regression)
else:
    print("Regression phase already complete; skipped all 20 province fits.")
print(json.dumps(_json_safe({
    "model": REGRESSION_MODEL_NAME,
    "global_eligible": regression.global_eligible,
    "global_reasons": regression.global_reasons,
    "validation_metrics": regression.validation_metrics,
    "test_metrics": regression.test_metrics,
}), ensure_ascii=False, indent=2))
regression_by_province = pd.DataFrame([
    {"province_id": province_id, **metrics}
    for province_id, metrics in regression.province_metrics.items()
]).sort_values("province_id")
display(regression_by_province[[
    "province_id", "mae", "rmse", "r2", "skill_vs_persistence",
    "local_eligible", "global_gate_eligible", "eligibility_reasons",
]])
""",
    )
    _set(
        notebook,
        "train_classification",
        """
if "_restore_checkpoint" not in globals():
    raise RuntimeError(
        "Session restarted. Rerun Configuration through Pipeline Imports, then rerun this cell."
    )
if any(name not in globals() for name in (
    "split", "config", "selected_provinces", "training_split_fingerprint"
)):
    _restore_checkpoint((
        "split", "config", "selected_provinces", "training_split_fingerprint"
    ))
if "regression" not in globals():
    _restore_checkpoint(("regression",))

# 10. Classification phase — resume CV folds; keep Regression untouched
if not _restore_stage("classification", ("classification",)):
    completed_classification_folds = _load_classification_folds()
    print({
        "classification_phase": "resume_or_train",
        "completed_cv_folds": sorted(index + 1 for index in completed_classification_folds),
        "remaining_cv_folds": sorted(
            index + 1 for index in set(range(CV_SPLITS)) - set(completed_classification_folds)
        ),
        "rf_parameter_candidates": 1,
        "cv_splits": CV_SPLITS,
    })
    classification = train_classification(
        split,
        config,
        cv_fold_results=completed_classification_folds,
        on_cv_fold_complete=_save_classification_fold,
    )
    _save_classification_province_evidence(classification)
    _save_checkpoint("classification", classification=classification)
else:
    print("Classification phase already complete; skipped pooled Random Forest fitting.")
metrics = classification.test_metrics
print(json.dumps(_json_safe({
    "model": CLASSIFICATION_MODEL_NAME,
    "training_gate_eligible": classification.global_eligible,
    "training_gate_reasons": classification.global_reasons,
    "accuracy": metrics.get("accuracy"),
    "balanced_accuracy": metrics.get("balanced_accuracy"),
    "macro_f1": metrics.get("macro_f1"),
    "weighted_f1": metrics.get("weighted_f1"),
}), ensure_ascii=False, indent=2))
per_class = pd.DataFrame([
    {"class_id": class_id, **metrics.get("per_class", {}).get(str(class_id), {})}
    for class_id in CLASS_IDS
])
display(per_class)
display(pd.DataFrame(
    metrics.get("confusion_matrix", []),
    index=[f"actual_{class_id}" for class_id in CLASS_IDS],
    columns=[f"predicted_{class_id}" for class_id in CLASS_IDS],
))
""",
    )
    _set(
        notebook,
        "eligibility",
        """
if "_restore_checkpoint" not in globals():
    raise RuntimeError(
        "Session restarted. Rerun Configuration through Pipeline Imports, then rerun this cell."
    )
if any(name not in globals() for name in (
    "split", "config", "selected_provinces", "archive_audit", "regression", "classification"
)):
    _restore_checkpoint((
        "split", "config", "selected_provinces", "archive_audit", "regression", "classification"
    ))

# 11. Apply the reviewed all-or-nothing v5.6.4 deployment policy before any write
split_origin_dates = {
    "train": int(split.train["date"].nunique()),
    "validation": int(split.validation["date"].nunique()),
    "test": int(split.test["date"].nunique()),
}
prior_regression_policy = regression.parameters.get("deployment_policy_audit")
strict_regression_global_eligible = bool(
    prior_regression_policy["original_global_eligible"]
    if prior_regression_policy
    else regression.global_eligible
)
strict_regression_global_reasons = list(
    prior_regression_policy["original_global_reasons"]
    if prior_regression_policy
    else regression.global_reasons
)
regression_policy = evaluate_regression_deployment_policy(
    regression.province_metrics,
    original_global_eligible=strict_regression_global_eligible,
    original_global_reasons=strict_regression_global_reasons,
    expected_provinces=PRODUCTION_REQUIRED_PROVINCES,
    minimum_validation_rows=FULL_YEAR_HOLDOUT_DAYS,
    minimum_test_rows=FULL_YEAR_HOLDOUT_DAYS,
    strict_minimum_skill=REGRESSION_MINIMUM_SKILL,
    conditional_floor=REGRESSION_CONDITIONAL_FLOOR,
    conditional_provinces=REGRESSION_CONDITIONAL_PROVINCES,
)
regression.parameters["deployment_policy_audit"] = regression_policy

for province_id, metrics in regression.province_metrics.items():
    decision = regression_policy["province_decisions"][province_id]
    metrics["strict_eligible"] = decision["strict_eligible"]
    metrics["strict_eligibility_reasons"] = decision[
        "strict_eligibility_reasons"
    ]
    metrics["deployment_eligible"] = decision["deployment_eligible"]
    metrics["activation_tier"] = decision["activation_tier"]
    metrics["observed_skill"] = decision["observed_skill"]
    metrics["target_skill"] = decision["target_skill"]
    metrics["conditional_floor"] = decision["conditional_floor"]
    metrics["override_reason"] = decision["override_reason"]
    metrics["deployment_policy"] = REGRESSION_CONDITIONAL_POLICY
    metrics["deployment_eligibility_reasons"] = (
        [REGRESSION_CONDITIONAL_OVERRIDE_REASON]
        if decision["activation_tier"] == "conditional"
        else ["eligible_under_strict_policy"]
        if decision["deployment_eligible"]
        else regression_policy["deployment_reasons"]
    )
    # build_registry_rows uses these operational fields. Strict evidence above
    # remains immutable and is also written to the Registry metrics JSON.
    metrics["eligible"] = decision["deployment_eligible"]
    metrics["local_eligible"] = decision["deployment_eligible"]
    metrics["global_gate_eligible"] = regression_policy["deployment_eligible"]

regression.global_eligible = regression_policy["deployment_eligible"]
regression.global_reasons = regression_policy["deployment_reasons"]
regression_failed_provinces = sorted(
    province_id
    for province_id, decision in regression_policy["province_decisions"].items()
    if not decision["strict_eligible"]
)
regression_failure_reasons = {
    province_id: regression_policy["province_decisions"][province_id][
        "strict_eligibility_reasons"
    ]
    for province_id in regression_failed_provinces
}
regression_conditional_provinces = list(
    regression_policy["conditional_provinces"]
)
regression_deployment_failed_provinces = list(
    regression_policy["deployment_failed_provinces"]
)
regression_eligible_provinces = sorted(
    province_id
    for province_id, decision in regression_policy["province_decisions"].items()
    if decision["deployment_eligible"]
)
production_regression_gate = bool(
    regression_policy["deployment_eligible"]
    and len(regression_eligible_provinces) == PRODUCTION_REQUIRED_PROVINCES
)

thresholds = CLASSIFICATION_DEPLOYMENT_THRESHOLDS
validation_metrics = classification.validation_metrics
test_metrics = classification.test_metrics
classification_deployment_reasons = []
metric_checks = (
    ("validation_macro_f1", validation_metrics["macro_f1"], thresholds["validation_macro_f1"]),
    ("validation_balanced_accuracy", validation_metrics["balanced_accuracy"], thresholds["validation_balanced_accuracy"]),
    ("test_accuracy", test_metrics["accuracy"], thresholds["test_accuracy"]),
    ("test_macro_f1", test_metrics["macro_f1"], thresholds["test_macro_f1"]),
    ("test_balanced_accuracy", test_metrics["balanced_accuracy"], thresholds["test_balanced_accuracy"]),
    ("test_weighted_f1", test_metrics["weighted_f1"], thresholds["test_weighted_f1"]),
)
for name, value, minimum in metric_checks:
    if not np.isfinite(value) or value < minimum:
        classification_deployment_reasons.append(f"{name}:{value:.6f}<{minimum:.6f}")
for class_id in (4, 5):
    evidence = test_metrics["per_class"][str(class_id)]
    if int(evidence["support"]) < thresholds["critical_support"]:
        classification_deployment_reasons.append(
            f"class_{class_id}_support:{evidence['support']}<{thresholds['critical_support']}"
        )
    if float(evidence["recall"]) < thresholds["critical_recall"]:
        classification_deployment_reasons.append(
            f"class_{class_id}_recall:{evidence['recall']:.6f}<{thresholds['critical_recall']:.6f}"
        )
if test_metrics.get("metric_class_contract") != list(CLASS_IDS):
    classification_deployment_reasons.append("metric_class_contract_mismatch")
if test_metrics["test_rows"] < PRODUCTION_REQUIRED_PROVINCES * FULL_YEAR_HOLDOUT_DAYS:
    classification_deployment_reasons.append("pooled_test_rows_incomplete")
if split_origin_dates["validation"] != FULL_YEAR_HOLDOUT_DAYS:
    classification_deployment_reasons.append("validation_origin_dates_not_365")
if split_origin_dates["test"] != FULL_YEAR_HOLDOUT_DAYS:
    classification_deployment_reasons.append("test_origin_dates_not_365")
if len(split.dropped_embargo_dates) != 2 * POOLED_EMBARGO_DAYS:
    classification_deployment_reasons.append("embargo_dates_not_14")

training_classification_gate = bool(classification.global_eligible)
training_classification_reasons = list(classification.global_reasons)
production_classification_gate = not classification_deployment_reasons
classification.global_eligible = production_classification_gate
classification.global_reasons = (
    ["eligible_under_pooled_deployment_policy"]
    if production_classification_gate
    else classification_deployment_reasons
)
for province_id, metrics in classification.province_metrics.items():
    metrics["training_gate_eligible"] = bool(metrics["eligible"])
    metrics["deployment_policy"] = "pooled_range_classification_v1"
    metrics["eligible"] = bool(
        production_classification_gate
        and metrics["test_rows"] >= FULL_YEAR_HOLDOUT_DAYS
    )
    metrics["local_eligible"] = metrics["eligible"]

classification_eligible_provinces = sorted(
    province_id
    for province_id, metrics in classification.province_metrics.items()
    if metrics["eligible"]
)
production_dual_model_gate = bool(
    production_regression_gate
    and production_classification_gate
    and len(classification_eligible_provinces) == PRODUCTION_REQUIRED_PROVINCES
)
eligibility = pd.DataFrame([
    {
        "province_id": province_id,
        "regression_strict_eligible": regression.province_metrics[province_id]["strict_eligible"],
        "regression_deployment_eligible": province_id in regression_eligible_provinces,
        "regression_activation_tier": regression.province_metrics[province_id]["activation_tier"],
        "regression_skill": regression.province_metrics[province_id]["skill_vs_persistence"],
        "regression_strict_reasons": regression.province_metrics[province_id]["strict_eligibility_reasons"],
        "regression_override_reason": regression.province_metrics[province_id]["override_reason"],
        "classification_eligible": classification.province_metrics[province_id]["eligible"],
    }
    for province_id in selected_provinces
]).sort_values("province_id")
display(eligibility)

gate_summary = {
    "regression": {
        "eligible": production_regression_gate,
        "policy": REGRESSION_CONDITIONAL_POLICY,
        "strict_global_eligible": regression_policy["strict_global_eligible"],
        "original_global_eligible": regression_policy["original_global_eligible"],
        "original_global_reasons": regression_policy["original_global_reasons"],
        "strict_eligible_provinces": regression_policy["strict_provinces"],
        "eligible_provinces": regression_eligible_provinces,
        "strict_failed_provinces": regression_failed_provinces,
        "strict_failure_reasons": regression_failure_reasons,
        "conditional_provinces": regression_conditional_provinces,
        "deployment_failed_provinces": regression_deployment_failed_provinces,
        "deployment_reasons": regression_policy["deployment_reasons"],
        "strict_required_skill": REGRESSION_MINIMUM_SKILL,
        "conditional_floor": REGRESSION_CONDITIONAL_FLOOR,
        "conditional_allowlist": list(REGRESSION_CONDITIONAL_PROVINCES),
        "research_reporting_note": regression_policy["research_reporting_note"],
    },
    "classification": {
        "eligible": production_classification_gate,
        "eligible_provinces": classification_eligible_provinces,
        "deployment_reasons": classification_deployment_reasons or ["eligible"],
        "thresholds": thresholds,
        "training_gate_eligible": training_classification_gate,
        "training_gate_reasons": training_classification_reasons,
    },
    "split_origin_dates": split_origin_dates,
    "embargo_dates": len(split.dropped_embargo_dates),
    "dual_model_gate": production_dual_model_gate,
}
print(json.dumps(_json_safe(gate_summary), ensure_ascii=False, indent=2))
if not production_dual_model_gate:
    failures = []
    if not production_regression_gate:
        failures.append(
            f"regression deployment={regression_policy['deployment_reasons']}, "
            f"strict_failed_provinces={regression_failed_provinces}, "
            f"strict_province_reasons={regression_failure_reasons}"
        )
    if not production_classification_gate:
        failures.append(f"classification={classification_deployment_reasons}")
    raise RuntimeError(
        "Production dual-model deployment gate failed: "
        + " | ".join(failures)
        + "; no Registry or activation write was made"
    )

_save_classification_province_evidence(classification)
_save_checkpoint(
    "eligibility",
    regression=regression,
    classification=classification,
    eligibility=eligibility,
    gate_summary=gate_summary,
    regression_eligible_provinces=regression_eligible_provinces,
    regression_conditional_provinces=regression_conditional_provinces,
    classification_eligible_provinces=classification_eligible_provinces,
)
""",
    )
    _set(
        notebook,
        "artifacts",
        """
if "_restore_checkpoint" not in globals():
    raise RuntimeError(
        "Session restarted. Rerun Configuration through Pipeline Imports, then rerun this cell."
    )
if any(name not in globals() for name in (
    "split", "config", "selected_provinces", "archive_audit", "regression",
    "classification", "eligibility", "gate_summary",
    "regression_eligible_provinces", "classification_eligible_provinces"
)):
    _restore_checkpoint((
        "split", "config", "selected_provinces", "archive_audit", "regression",
        "classification", "eligibility", "gate_summary",
        "regression_eligible_provinces", "classification_eligible_provinces"
    ))

# 12. Build 21 auditable artifacts and 40 inactive registry candidates
run_id = str(uuid.uuid4())
audit = {
    "notebook_version": "5.6.4",
    "strategy": "pooled_split_local_residual_regression_and_pooled_classification",
    "pool_provinces": list(selected_provinces),
    "feature_version": POOLED_FEATURE_VERSION,
    "feature_provenance": POOLED_FEATURE_PROVENANCE,
    "target_source": "Open-Meteo archive plus trusted database continuation",
    "target_horizons": list(DIRECT_HORIZONS),
    "validated_classification_horizons": [1],
    "final_test_used_for_selection": False,
    "same_date_same_partition": True,
    "embargo_days": POOLED_EMBARGO_DAYS,
    "dropped_embargo_dates": split.dropped_embargo_dates,
    "rows": {
        "train": len(split.train),
        "validation": len(split.validation),
        "test": len(split.test),
    },
    "archive": archive_audit,
    "deployment_policy": gate_summary,
    "strict_research_result_preserved": True,
    "conditional_activation_scope": list(REGRESSION_CONDITIONAL_PROVINCES),
    "conditional_policy_selected_after_test_observation": True,
    "approved_code_sha": APPROVED_CODE_SHA,
    "training_checkpoint_compatibility_sha": TRAINING_CHECKPOINT_COMPATIBILITY_SHA,
    "activation_contract": "fn_activate_pooled_dual_model_run",
}
registry_rows = build_registry_rows(
    run_id, selected_provinces, split, regression, classification, audit
)
for row in registry_rows:
    if row["task_type"] != "regression":
        continue
    deployment_metrics = regression.province_metrics[row["province_id"]]
    activation_tier = deployment_metrics["activation_tier"]
    row["model_params"]["strict_eligible"] = deployment_metrics[
        "strict_eligible"
    ]
    row["model_params"]["deployment_eligible"] = deployment_metrics[
        "deployment_eligible"
    ]
    row["model_params"]["activation_tier"] = activation_tier
    row["model_params"]["observed_skill"] = deployment_metrics[
        "observed_skill"
    ]
    row["model_params"]["strict_target_skill"] = REGRESSION_MINIMUM_SKILL
    row["model_params"]["conditional_floor"] = REGRESSION_CONDITIONAL_FLOOR
    row["model_params"]["override_reason"] = deployment_metrics[
        "override_reason"
    ]
    if activation_tier == "conditional":
        row["eligibility_reason"] = (
            "conditional_near_threshold_operational_acceptance;"
            "strict_research_gate_failed"
        )
result = PooledResult(
    run_id, selected_provinces, split, regression, classification, registry_rows, audit
)
artifacts = save_artifacts(result, config.artifact_directory, config)

if len(registry_rows) != PRODUCTION_REQUIRED_PROVINCES * 2:
    raise RuntimeError(f"Expected 40 registry rows, found {len(registry_rows)}")
if set(artifacts["regression"]) != set(selected_provinces):
    raise RuntimeError("Residual regression artifact set does not cover all provinces")
if set(artifacts["classification"]) != {"pooled"}:
    raise RuntimeError("Expected exactly one pooled classification artifact")
for task_type in ("regression", "classification"):
    task_rows = [row for row in registry_rows if row["task_type"] == task_type]
    if len(task_rows) != PRODUCTION_REQUIRED_PROVINCES:
        raise RuntimeError(f"{task_type} registry row count is {len(task_rows)}")
    if not all(
        row["eligibility_status"] and row["evidence_status"] == "validated"
        for row in task_rows
    ):
        raise RuntimeError(f"{task_type} contains a non-deployable registry row")
    for artifact_key, paths in artifacts[task_type].items():
        payload = paths["runtime_path"].read_bytes()
        if hashlib.sha256(payload).hexdigest() != paths["runtime_sha256"]:
            raise RuntimeError(f"{task_type}/{artifact_key} runtime checksum changed after save")
        decoded = decode_artifact(payload)
        if decoded["artifact_schema"] != ARTIFACT_SCHEMA or decoded["task_type"] != task_type:
            raise RuntimeError(f"{task_type}/{artifact_key} runtime artifact contract mismatch")

run_summary = {
    "run_id": run_id,
    "mode": "production",
    "activate": ACTIVATE,
    "regression": {
        "model": REGRESSION_MODEL_NAME,
        "global_eligible": regression.global_eligible,
        "eligible_provinces": regression_eligible_provinces,
        "metrics": regression.test_metrics,
    },
    "classification": {
        "model": CLASSIFICATION_MODEL_NAME,
        "global_eligible": classification.global_eligible,
        "eligible_provinces": classification_eligible_provinces,
        "metrics": classification.test_metrics,
    },
    "audit": audit,
    "created_at": datetime.now(timezone.utc).isoformat(),
}
summary_path = config.artifact_directory / run_id / "run_summary.json"
summary_path.write_text(
    json.dumps(_json_safe(run_summary), ensure_ascii=False, indent=2),
    encoding="utf-8",
)
print({
    "run_id": run_id,
    "registry_rows": len(registry_rows),
    "regression_artifacts": len(artifacts["regression"]),
    "classification_artifacts": len(artifacts["classification"]),
    "production_writes": 0,
})

_save_checkpoint(
    "artifacts",
    config=config,
    selected_provinces=selected_provinces,
    regression=regression,
    classification=classification,
    eligibility=eligibility,
    gate_summary=gate_summary,
    run_id=run_id,
    result=result,
    artifacts=artifacts,
    run_summary=run_summary,
    summary_path=summary_path,
)
""",
    )
    _set(
        notebook,
        "register_activate",
        """
if "_restore_checkpoint" not in globals():
    raise RuntimeError(
        "Session restarted. Rerun Configuration through Pipeline Imports, then rerun this cell."
    )
if any(name not in globals() for name in (
    "config", "selected_provinces", "regression", "classification", "eligibility",
    "run_id", "result", "artifacts", "run_summary", "summary_path"
)):
    _restore_checkpoint((
        "config", "selected_provinces", "regression", "classification", "eligibility",
        "run_id", "result", "artifacts", "run_summary", "summary_path"
    ))
if "sb" not in globals():
    sb = get_client()

# 13. Atomic promotion — only after both persisted phases cover all 20 provinces
if len(regression.province_metrics) != PRODUCTION_REQUIRED_PROVINCES:
    raise RuntimeError("Regression checkpoint does not cover all 20 provinces")
if len(classification.province_metrics) != PRODUCTION_REQUIRED_PROVINCES:
    raise RuntimeError("Classification checkpoint does not cover all 20 provinces")
if len(result.registry_rows) != PRODUCTION_REQUIRED_PROVINCES * 2:
    raise RuntimeError("Atomic activation requires exactly 40 task/province candidates")

if _restore_stage("activated", ("activated_run_id",)):
    if activated_run_id != run_id:
        raise RuntimeError(
            f"Activation checkpoint run {activated_run_id} differs from artifact run {run_id}"
        )
    print({"registered": True, "activated": True, "resumed": True, "run_id": run_id})
elif REGISTER:
    # upload_and_register first upserts all 40 inactive candidates, then invokes
    # fn_activate_pooled_dual_model_run exactly once. The database function is
    # the transaction boundary; a failure cannot activate only one task/province.
    upload_and_register(sb, result, artifacts, activate=ACTIVATE)
    _save_checkpoint("activated", activated_run_id=run_id)
    print({
        "registered": True,
        "activate_requested": ACTIVATE,
        "atomic_rpc": "fn_activate_pooled_dual_model_run",
        "run_id": run_id,
    })
else:
    print("REGISTER is False; no Storage, Registry, activation, or forecast write occurred.")
""",
    )
    download = "".join(_cell(notebook, "download")["source"])
    _set(notebook, "download", download.replace("v5.6.2", "v5.6.4"))
    _write_notebook(notebook, output)


def build_production(approved_sha: str, output: Path) -> None:
    if len(approved_sha) != 40:
        raise ValueError("--approved-sha must be a full 40-character commit SHA")
    notebook = json.loads(PRODUCTION_TEMPLATE.read_text(encoding="utf-8"))
    for cell in notebook["cells"]:
        text = "".join(cell.get("source", []))
        text = text.replace("v5.6.1", "v5.6.2")
        text = text.replace("production-v5.6.1", "production-v5.6.2")
        cell["source"] = _source(text)

    if _has_cell(notebook, "train_regression") and not _has_cell(
        notebook, "train_models"
    ):
        _build_current_production(notebook, approved_sha, output)
        return

    _set(
        notebook,
        "intro",
        """
# Thai Air Intelligence — Production Dual-Model PM2.5 v5.6.2

This Colab notebook trains and promotes the exact two-family runtime deployed in Production:

- **Numeric PM2.5:** 20 province-local LightGBM models that learn a residual correction to current-day persistence for direct D+1 through D+7 predictions.
- **Air-quality class:** one pooled Random Forest classifier used for D+1 class probabilities.
- **Fallback:** the recent seven-day observed mean when an active artifact is missing, corrupt, stale, or ineligible.

Validation and Test each cover 365 origin dates with a seven-day embargo. Each residual correction weight is selected on province-local D+1 Validation, conservatively shrunk by 0.90, and frozen before untouched Test evaluation. Portable `json+gzip` artifacts are checksum verified and compared with native outputs before any Production write.

The deployment policy requires every province-local regressor to retain at least 4.5% MAE Skill versus Persistence. Classification uses one pooled range-decision gate: Test Accuracy ≥ 0.65, Macro F1 ≥ 0.50, Balanced Accuracy ≥ 0.50, Weighted F1 ≥ 0.60, and Recall ≥ 0.35 for Classes 4 and 5 with at least five examples each. Every province must have a complete 365-day Test window.

Promotion is all-or-nothing. The notebook registers 40 inactive task/province candidates backed by 20 residual LightGBM artifacts and one pooled Random Forest artifact, then invokes one atomic database RPC. It subsequently generates a seven-day forecast and verifies that D+1 uses both active model tasks.

Cell 9 writes a local checkpoint. If the Python session restarts before Cell 10, rerun Cell 10; it restores the trained objects when the Colab VM filesystem is still available. If the VM itself was replaced, rerun Cells 1–9.

Required Colab Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ML_SECRET`, and either `ML_FORECAST_URL` or `WEBSITE_URL`.
""",
    )
    configuration = "".join(_cell(notebook, "configuration")["source"])
    configuration = configuration.replace(
        'PRODUCTION_APPROVAL = "APPROVED_PORTABLE_POOLED_DUAL_MODEL_V5_6"',
        'PRODUCTION_APPROVAL = "APPROVED_RESIDUAL_DUAL_MODEL_V5_6_2"',
    )
    configuration = configuration.replace(
        'if PRODUCTION_APPROVAL != "APPROVED_PORTABLE_POOLED_DUAL_MODEL_V5_6":',
        'if PRODUCTION_APPROVAL != "APPROVED_RESIDUAL_DUAL_MODEL_V5_6_2":',
    )
    configuration = configuration.replace(
        'APPROVED_CODE_SHA = "9e19646d9ecdf1aff9d4939fce42ced5af9eb464"',
        f'APPROVED_CODE_SHA = "{approved_sha}"',
    )
    configuration = configuration.replace(
        '"notebook_version": "5.6.1"',
        '"notebook_version": "5.6.2"',
    )
    _set(notebook, "configuration", configuration)

    _set(
        notebook,
        "train_models",
        """
# 9. Train 20 residual LightGBM models and the pooled Random Forest, then checkpoint
import hashlib
import joblib

regression = train_regression(split, config)
classification = train_classification(split, config)
print({
    "regression_model": REGRESSION_MODEL_NAME,
    "regression_artifacts": len(regression.runtime_artifact),
    "regression_global_research_gate": regression.global_eligible,
    "classification_model": CLASSIFICATION_MODEL_NAME,
    "classification_original_strict_gate": classification.global_eligible,
    "regression_test": regression.test_metrics,
    "classification_test": classification.test_metrics,
})

CHECKPOINT_PATH = Path("/content/pm25_v5_6_2_after_cell9.joblib")
checkpoint_payload = {
    "split": split,
    "regression": regression,
    "classification": classification,
    "archive_audit": archive_audit,
    "selected_provinces": selected_provinces,
}
joblib.dump(checkpoint_payload, CHECKPOINT_PATH, compress=3)
checkpoint_sha256 = hashlib.sha256(CHECKPOINT_PATH.read_bytes()).hexdigest()
print({
    "checkpoint": str(CHECKPOINT_PATH),
    "checkpoint_sha256": checkpoint_sha256,
    "checkpoint_bytes": CHECKPOINT_PATH.stat().st_size,
})
""",
    )

    _set(
        notebook,
        "deployment_gate",
        f"""
# 10. Restore checkpoint if needed, then audit serialized artifact parity and deployment gates
import hashlib
import json
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

REPOSITORY_DIRECTORY = Path("/content/THAI-AIR-INTELLIGENCE-LITE")
if not REPOSITORY_DIRECTORY.exists():
    raise RuntimeError("Repository is unavailable; rerun Cells 1-9 in this Colab VM")
os.chdir(REPOSITORY_DIRECTORY)
if str(REPOSITORY_DIRECTORY) not in sys.path:
    sys.path.insert(0, str(REPOSITORY_DIRECTORY))

from api.ml.portable_trees import (
    ARTIFACT_SCHEMA,
    decode_artifact,
    encode_artifact,
    evaluate_lightgbm_regressor,
    evaluate_random_forest_classifier,
)
from training.dual_model_config import (
    FALLBACK_MODEL_NAME,
    FALLBACK_STRATEGY,
    FALLBACK_WINDOW_DAYS,
    POOLED_FEATURE_COLUMNS,
    POOLED_FEATURE_PROVENANCE,
    POOLED_FEATURE_VERSION,
    POOLED_MINIMUM_ORIGIN_DAYS,
    POOLED_PROVINCE_IDS,
    PipelineConfig,
)
from training.pm25_classes import CLASS_IDS, THRESHOLD_VERSION
from training.train_dual_models import _json_safe
from training.train_pooled_models import (
    CLASSIFICATION_MODEL_NAME,
    DIRECT_HORIZONS,
    MODEL_VERSION,
    PooledResult,
    REGRESSION_MODEL_NAME,
    _aligned_rf_probabilities,
    _temperature_scale,
    build_registry_rows,
    get_client,
    save_artifacts,
    upload_and_register,
)

APPROVED_CODE_SHA = globals().get("APPROVED_CODE_SHA", "{approved_sha}")
PRODUCTION_REQUIRED_PROVINCES = 20
FULL_YEAR_HOLDOUT_DAYS = 365
POOLED_EMBARGO_DAYS = 7
REGRESSION_MINIMUM_SKILL = 0.045
ARTIFACT_DIRECTORY = "training/artifacts"
FORECAST_HORIZON_DAYS = 7
CLASSIFICATION_DEPLOYMENT_THRESHOLDS = {{
    "validation_macro_f1": 0.45,
    "validation_balanced_accuracy": 0.45,
    "test_accuracy": 0.65,
    "test_macro_f1": 0.50,
    "test_balanced_accuracy": 0.50,
    "test_weighted_f1": 0.60,
    "critical_recall": 0.35,
    "critical_support": 5,
}}
config = PipelineConfig(
    minimum_rows=POOLED_MINIMUM_ORIGIN_DAYS,
    minimum_validation_rows=FULL_YEAR_HOLDOUT_DAYS,
    minimum_test_rows=FULL_YEAR_HOLDOUT_DAYS,
    cv_splits=5,
    regression_minimum_skill=REGRESSION_MINIMUM_SKILL,
    classifier_minimum_macro_f1=CLASSIFICATION_DEPLOYMENT_THRESHOLDS["test_macro_f1"],
    classifier_minimum_critical_recall=CLASSIFICATION_DEPLOYMENT_THRESHOLDS["critical_recall"],
    critical_class_minimum_support=CLASSIFICATION_DEPLOYMENT_THRESHOLDS["critical_support"],
    artifact_directory=Path(ARTIFACT_DIRECTORY),
)
config.validate()

CHECKPOINT_PATH = Path("/content/pm25_v5_6_2_after_cell9.joblib")
required_objects = ("split", "regression", "classification")
if any(name not in globals() for name in required_objects):
    if not CHECKPOINT_PATH.exists():
        raise RuntimeError("Training checkpoint is unavailable; rerun Cells 6-9")
    checkpoint_payload = joblib.load(CHECKPOINT_PATH)
    split = checkpoint_payload["split"]
    regression = checkpoint_payload["regression"]
    classification = checkpoint_payload["classification"]
    archive_audit = checkpoint_payload["archive_audit"]
    selected_provinces = tuple(checkpoint_payload["selected_provinces"])
    print({{"checkpoint_restored": str(CHECKPOINT_PATH)}})
else:
    selected_provinces = tuple(globals().get("selected_provinces", POOLED_PROVINCE_IDS))
if "archive_audit" not in globals():
    raise RuntimeError("archive_audit is unavailable; rerun Cells 6-9")

split_origin_dates = {{
    "train": int(split.train["date"].nunique()),
    "validation": int(split.validation["date"].nunique()),
    "test": int(split.test["date"].nunique()),
}}
if split_origin_dates["validation"] != FULL_YEAR_HOLDOUT_DAYS:
    raise RuntimeError(f"Validation must contain exactly 365 origin dates: {{split_origin_dates}}")
if split_origin_dates["test"] != FULL_YEAR_HOLDOUT_DAYS:
    raise RuntimeError(f"Test must contain exactly 365 origin dates: {{split_origin_dates}}")
if len(split.dropped_embargo_dates) != 2 * POOLED_EMBARGO_DAYS:
    raise RuntimeError(
        f"Expected 14 embargo dates, found {{len(split.dropped_embargo_dates)}}"
    )

if "sb" not in globals():
    from google.colab import userdata
    def _secret(*names):
        for name in names:
            try:
                value = (userdata.get(name) or "").strip()
            except Exception:
                value = ""
            if value:
                return value
        raise ValueError(f"Missing Colab Secret; add one of: {{', '.join(names)}}")
    os.environ["SUPABASE_URL"] = _secret("SUPABASE_URL")
    os.environ["SUPABASE_SERVICE_ROLE_KEY"] = _secret("SUPABASE_SERVICE_ROLE_KEY")
    ML_SECRET = _secret("ML_SECRET")
    ML_FORECAST_URL = _secret("ML_FORECAST_URL", "WEBSITE_URL").rstrip("/")
    sb = get_client()

def _audit_indices(frame, maximum=350):
    base = np.linspace(0, len(frame) - 1, min(maximum, len(frame)), dtype=int)
    critical = []
    values = frame["target_air_quality_class"].to_numpy(dtype=int)
    for class_id in (4, 5):
        found = np.flatnonzero(values == class_id)
        if len(found):
            critical.extend(found[np.linspace(0, len(found) - 1, min(100, len(found)), dtype=int)])
    return np.unique(np.concatenate([base, np.asarray(critical, dtype=int)]))

regression_parity_errors = {{}}
for province_id in selected_provinces:
    province_rows = split.test[split.test["province_id"] == province_id].reset_index(drop=True)
    province_indices = _audit_indices(province_rows)
    audit_frame = province_rows.loc[province_indices]
    audit_X = audit_frame.loc[:, POOLED_FEATURE_COLUMNS].to_numpy(dtype=float)
    baseline = audit_frame["pm25_mean"].to_numpy(dtype=float)
    correction_weight = float(regression.parameters["by_province"][province_id]["correction_weight"])
    regression_readback = decode_artifact(encode_artifact(regression.runtime_artifact[province_id]))
    regression_native = baseline + correction_weight * np.asarray(
        regression.model[province_id].predict(audit_X), dtype=float
    )
    regression_portable = np.asarray([
        evaluate_lightgbm_regressor(row, regression_readback) for row in audit_X
    ], dtype=float)
    regression_parity_errors[province_id] = float(
        np.max(np.abs(regression_native - regression_portable))
    )
regression_parity_max_abs_error = max(regression_parity_errors.values())

test_rows = split.test.reset_index(drop=True)
audit_indices = _audit_indices(test_rows, maximum=2000)
audit_X = test_rows.loc[audit_indices, POOLED_FEATURE_COLUMNS].to_numpy(dtype=float)
classification_readback = decode_artifact(encode_artifact(classification.runtime_artifact))
classification_native = _temperature_scale(
    _aligned_rf_probabilities(classification.model, audit_X),
    float(classification.parameters["temperature"]),
)
classification_portable = np.asarray([
    [
        evaluate_random_forest_classifier(row, classification_readback)[str(class_id)]
        for class_id in CLASS_IDS
    ]
    for row in audit_X
], dtype=float)
classification_parity_max_abs_error = float(
    np.max(np.abs(classification_native - classification_portable))
)
classification_decision_parity = bool(np.array_equal(
    np.argmax(classification_native, axis=1),
    np.argmax(classification_portable, axis=1),
))
if regression_parity_max_abs_error > 1e-10:
    raise RuntimeError(f"Residual LightGBM portable parity failed: {{regression_parity_max_abs_error}}")
if classification_parity_max_abs_error > 1e-10 or not classification_decision_parity:
    raise RuntimeError(
        f"Random Forest portable parity failed: {{classification_parity_max_abs_error}}, "
        f"decision={{classification_decision_parity}}"
    )

regression_eligible_provinces = sorted(
    province_id for province_id, metrics in regression.province_metrics.items()
    if metrics.get("local_eligible", metrics["eligible"])
)
regression_failed_provinces = sorted(
    province_id for province_id, metrics in regression.province_metrics.items()
    if not metrics.get("local_eligible", metrics["eligible"])
)
regression_failure_reasons = {{
    province_id: list(regression.province_metrics[province_id].get("eligibility_reasons", []))
    for province_id in regression_failed_provinces
}}
production_regression_gate = bool(
    regression.global_eligible
    and len(regression_eligible_provinces) == PRODUCTION_REQUIRED_PROVINCES
)

thresholds = CLASSIFICATION_DEPLOYMENT_THRESHOLDS
validation_metrics = classification.validation_metrics
test_metrics = classification.test_metrics
classification_deployment_reasons = []
metric_checks = (
    ("validation_macro_f1", validation_metrics["macro_f1"], thresholds["validation_macro_f1"]),
    ("validation_balanced_accuracy", validation_metrics["balanced_accuracy"], thresholds["validation_balanced_accuracy"]),
    ("test_accuracy", test_metrics["accuracy"], thresholds["test_accuracy"]),
    ("test_macro_f1", test_metrics["macro_f1"], thresholds["test_macro_f1"]),
    ("test_balanced_accuracy", test_metrics["balanced_accuracy"], thresholds["test_balanced_accuracy"]),
    ("test_weighted_f1", test_metrics["weighted_f1"], thresholds["test_weighted_f1"]),
)
for name, value, minimum in metric_checks:
    if not np.isfinite(value) or value < minimum:
        classification_deployment_reasons.append(f"{{name}}:{{value:.6f}}<{{minimum:.6f}}")
for class_id in (4, 5):
    evidence = test_metrics["per_class"][str(class_id)]
    if int(evidence["support"]) < thresholds["critical_support"]:
        classification_deployment_reasons.append(
            f"class_{{class_id}}_support:{{evidence['support']}}<{{thresholds['critical_support']}}"
        )
    if float(evidence["recall"]) < thresholds["critical_recall"]:
        classification_deployment_reasons.append(
            f"class_{{class_id}}_recall:{{evidence['recall']:.6f}}<{{thresholds['critical_recall']:.6f}}"
        )
if test_metrics.get("metric_class_contract") != list(CLASS_IDS):
    classification_deployment_reasons.append("metric_class_contract_mismatch")
if test_metrics["test_rows"] < PRODUCTION_REQUIRED_PROVINCES * FULL_YEAR_HOLDOUT_DAYS:
    classification_deployment_reasons.append("pooled_test_rows_incomplete")

classification_original_strict_global_eligible = bool(classification.global_eligible)
classification_original_strict_reasons = list(classification.global_reasons)
classification_original_local_eligibility = {{
    province_id: bool(metrics["eligible"])
    for province_id, metrics in classification.province_metrics.items()
}}
production_classification_gate = not classification_deployment_reasons
classification.global_eligible = production_classification_gate
classification.global_reasons = (
    ["eligible_under_pooled_deployment_policy"]
    if production_classification_gate
    else classification_deployment_reasons
)
for province_id, metrics in classification.province_metrics.items():
    metrics["strict_research_eligible"] = classification_original_local_eligibility[province_id]
    metrics["deployment_policy"] = "pooled_range_classification_v1"
    metrics["eligible"] = bool(
        production_classification_gate
        and metrics["test_rows"] >= FULL_YEAR_HOLDOUT_DAYS
    )

classification_eligible_provinces = sorted(
    province_id for province_id, metrics in classification.province_metrics.items()
    if metrics["eligible"]
)
production_dual_model_gate = bool(
    production_regression_gate
    and production_classification_gate
    and len(classification_eligible_provinces) == PRODUCTION_REQUIRED_PROVINCES
)
gate_summary = {{
    "regression": {{
        "eligible": production_regression_gate,
        "eligible_provinces": regression_eligible_provinces,
        "failed_provinces": regression_failed_provinces,
        "failure_reasons": regression_failure_reasons,
        "global_reasons": list(regression.global_reasons),
        "required_skill": REGRESSION_MINIMUM_SKILL,
        "portable_parity_max_abs_error": regression_parity_max_abs_error,
        "portable_parity_by_province": regression_parity_errors,
    }},
    "classification": {{
        "eligible": production_classification_gate,
        "eligible_provinces": classification_eligible_provinces,
        "deployment_reasons": classification_deployment_reasons or ["eligible"],
        "thresholds": thresholds,
        "original_strict_global_eligible": classification_original_strict_global_eligible,
        "original_strict_reasons": classification_original_strict_reasons,
        "portable_parity_max_abs_error": classification_parity_max_abs_error,
        "decision_parity": classification_decision_parity,
    }},
    "split_origin_dates": split_origin_dates,
    "embargo_dates": len(split.dropped_embargo_dates),
    "dual_model_gate": production_dual_model_gate,
}}
print(json.dumps(_json_safe(gate_summary), ensure_ascii=False, indent=2))
if not production_dual_model_gate:
    failures = []
    if not production_regression_gate:
        failures.append(
            f"regression global={{regression.global_reasons}}, "
            f"failed_provinces={{regression_failed_provinces}}, "
            f"province_reasons={{regression_failure_reasons}}"
        )
    if not production_classification_gate:
        failures.append(f"classification={{classification_deployment_reasons}}")
    raise RuntimeError(
        "Production dual-model deployment gate failed: "
        + " | ".join(failures)
        + "; no Registry or activation write was made"
    )
""",
    )

    _set(
        notebook,
        "artifacts",
        """
# 11. Build 21 auditable model artifacts and 40 inactive registry candidates
run_id = str(uuid.uuid4())
audit = {
    "notebook_version": "5.6.2",
    "strategy": "pooled_split_local_residual_regression_and_pooled_classification",
    "pool_provinces": list(selected_provinces),
    "feature_version": POOLED_FEATURE_VERSION,
    "feature_provenance": POOLED_FEATURE_PROVENANCE,
    "target_source": "future Open-Meteo CAMS model-derived PM2.5 plus trusted database continuation",
    "target_horizons": list(DIRECT_HORIZONS),
    "validated_classification_horizons": [1],
    "final_test_used_for_selection": False,
    "residual_weight_selection": "province-local D+1 validation grid then 0.90 shrinkage",
    "same_date_same_partition": True,
    "embargo_days": POOLED_EMBARGO_DAYS,
    "dropped_embargo_dates": split.dropped_embargo_dates,
    "rows": {"train": len(split.train), "validation": len(split.validation), "test": len(split.test)},
    "archive": archive_audit,
    "deployment_policy": gate_summary,
    "approved_code_sha": APPROVED_CODE_SHA,
    "activation_contract": "fn_activate_pooled_dual_model_run",
}
registry_rows = build_registry_rows(
    run_id,
    selected_provinces,
    split,
    regression,
    classification,
    audit,
)
result = PooledResult(
    run_id,
    selected_provinces,
    split,
    regression,
    classification,
    registry_rows,
    audit,
)
artifacts = save_artifacts(result, config.artifact_directory, config)

if len(registry_rows) != PRODUCTION_REQUIRED_PROVINCES * 2:
    raise RuntimeError(f"Expected 40 registry rows, found {len(registry_rows)}")
if set(artifacts["regression"]) != set(selected_provinces):
    raise RuntimeError("Residual regression artifact set does not cover all provinces")
if set(artifacts["classification"]) != {"pooled"}:
    raise RuntimeError("Expected exactly one pooled classification artifact")
for task_type in ("regression", "classification"):
    task_rows = [row for row in registry_rows if row["task_type"] == task_type]
    if len(task_rows) != PRODUCTION_REQUIRED_PROVINCES:
        raise RuntimeError(f"{task_type} registry row count is {len(task_rows)}")
    if not all(row["eligibility_status"] and row["evidence_status"] == "validated" for row in task_rows):
        raise RuntimeError(f"{task_type} contains a non-deployable registry row")
    for artifact_key, paths in artifacts[task_type].items():
        payload = paths["runtime_path"].read_bytes()
        if hashlib.sha256(payload).hexdigest() != paths["runtime_sha256"]:
            raise RuntimeError(f"{task_type}/{artifact_key} runtime checksum changed after save")
        decoded = decode_artifact(payload)
        if decoded["artifact_schema"] != ARTIFACT_SCHEMA or decoded["task_type"] != task_type:
            raise RuntimeError(f"{task_type}/{artifact_key} runtime artifact contract mismatch")

print({
    "run_id": run_id,
    "registry_rows": len(registry_rows),
    "regression_artifacts": len(artifacts["regression"]),
    "classification_artifacts": len(artifacts["classification"]),
    "production_writes": 0,
})
""",
    )

    forecast = "".join(_cell(notebook, "forecast_verify")["source"])
    forecast = forecast.replace('"notebook_version": "5.6",', '"notebook_version": "5.6.2",')
    forecast = forecast.replace(
        '"regression": artifacts["regression"]["runtime_sha256"],\n        "classification": artifacts["classification"]["runtime_sha256"],',
        '"regression": {\n            province_id: paths["runtime_sha256"]\n            for province_id, paths in artifacts["regression"].items()\n        },\n        "classification": artifacts["classification"]["pooled"]["runtime_sha256"],',
    )
    forecast = forecast.replace("run_summary_v5_6.json", "run_summary_v5_6_2.json")
    _set(notebook, "forecast_verify", forecast)

    _set(
        notebook,
        "download",
        """
# 15. Download the auditable v5.6.2 Production bundle
import shutil
from google.colab import files

archive_base = Path(f"pm25_residual_dual_production_v5_6_2_{run_id}")
archive_path = shutil.make_archive(
    str(archive_base),
    "zip",
    root_dir=config.artifact_directory / run_id,
)
print("ZIP ready:", archive_path)
files.download(archive_path)
""",
    )
    _write_notebook(notebook, output)


def update_safe_notebooks(approved_sha: str) -> None:
    if len(approved_sha) != 40:
        raise ValueError("--approved-sha must be a full 40-character commit SHA")
    for path in SAFE_NOTEBOOKS:
        notebook = json.loads(path.read_text(encoding="utf-8"))
        compatibility = path.name == "train_all_6_models_pm25.ipynb"
        title_suffix = " (Compatibility Path)" if compatibility else ""
        _set(
            notebook,
            "intro",
            f"""
# Thai Air Intelligence — Residual PM2.5 Dual-Model Trainer{title_suffix}

Canonical Google Colab workflow for the same Python pipeline used by GitHub Actions and Production: 20 province-local **LightGBMRegressor** artifacts learn corrections to current-day persistence, while one pooled **RandomForestClassifier** predicts the five air-quality classes. Both tasks use a fixed 365-origin-date Validation window, a fixed 365-origin-date Test window, direct observed D+1 through D+7 targets, and a seven-day embargo on both boundaries. Regression correction weights are selected only on Validation, conservatively shrunk by 0.90, and frozen before Test.

Run every cell from top to bottom in a fresh Colab runtime. The notebook imports reviewed repository functions instead of maintaining a second copy of the training algorithm.

Required Colab Secrets: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Forecast generation remains a separate Production operation.

Safe defaults: `REGISTER = False` and `ACTIVATE = False`. This creates auditable shadow artifacts locally but does not change `model_registry`, active models, or forecasts.

If regression training is ineligible or its serving artifact is unavailable, forecasts use `recent-mean-v1`: the arithmetic mean of the latest seven trusted observed PM2.5 days. Classification then derives its class from that numeric fallback.
""",
        )
        configuration = "".join(_cell(notebook, "configuration")["source"])
        configuration = configuration.replace(
            next(
                line.strip()
                for line in configuration.splitlines()
                if line.strip().startswith("APPROVED_CODE_SHA =")
            ),
            f'APPROVED_CODE_SHA = "{approved_sha}"',
        )
        configuration = configuration.replace(
            "MINIMUM_ROWS = 180  # unique leakage-safe origin dates",
            "MINIMUM_ROWS = 834  # 90 train + 365 validation + 365 test + 14 embargo",
        )
        configuration = configuration.replace("CV_SPLITS = 3", "CV_SPLITS = 5")
        configuration = configuration.replace(
            "if MINIMUM_ROWS < 180:",
            "if MINIMUM_ROWS < 834:",
        )
        configuration = configuration.replace(
            'raise ValueError("Do not lower MINIMUM_ROWS below the reviewed 180-day gate")',
            'raise ValueError("Do not lower MINIMUM_ROWS below the reviewed 834-origin-date gate")',
        )
        _set(notebook, "configuration", configuration)
        imports = "".join(_cell(notebook, "pipeline_imports")["source"])
        _set(
            notebook,
            "pipeline_imports",
            imports.replace(
                "# 5. Import the exact pooled pipeline used by GitHub Actions",
                "# 5. Import the exact residual-regression and pooled-classification pipeline",
            ),
        )
        _set(
            notebook,
            "train_regression",
            """
# 9. Train province-local residual LightGBM models and preserve local eligibility evidence
regression = train_regression(split, config)
print(json.dumps(_json_safe({
    "model": REGRESSION_MODEL_NAME,
    "global_eligible": regression.global_eligible,
    "global_reasons": regression.global_reasons,
    "validation_metrics": regression.validation_metrics,
    "test_metrics": regression.test_metrics,
}), ensure_ascii=False, indent=2))
regression_by_province = pd.DataFrame([
    {"province_id": province_id, **metrics}
    for province_id, metrics in regression.province_metrics.items()
]).sort_values("province_id")
display(regression_by_province[[
    "province_id", "mae", "rmse", "r2", "skill_vs_persistence",
    "local_eligible", "global_gate_eligible", "eligibility_reasons",
]])
""",
        )
        artifacts = "".join(_cell(notebook, "artifacts")["source"])
        artifacts = artifacts.replace(
            '"strategy": "pooled_purged_chronological_direct_horizon"',
            '"strategy": "pooled_split_local_residual_regression_and_pooled_classification"',
        )
        _set(notebook, "artifacts", artifacts)
        promotion = "".join(_cell(notebook, "register_activate")["source"])
        promotion = promotion.replace(
            "# 13. Optional promotion — uploads/registers candidates; activates eligible rows only",
            "# 13. Optional promotion — uploads/registers candidates; activation is atomic across both tasks",
        )
        _set(notebook, "register_activate", promotion)
        _clear_outputs(notebook)
        path.write_text(
            json.dumps(notebook, ensure_ascii=False, indent=1) + "\n",
            encoding="utf-8",
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--approved-sha", required=True)
    parser.add_argument("--production-output", type=Path)
    parser.add_argument("--update-repository-notebooks", action="store_true")
    args = parser.parse_args()
    if args.production_output:
        build_production(args.approved_sha, args.production_output)
    if args.update_repository_notebooks:
        update_safe_notebooks(args.approved_sha)
    if not args.production_output and not args.update_repository_notebooks:
        parser.error("select --production-output and/or --update-repository-notebooks")


if __name__ == "__main__":
    main()
