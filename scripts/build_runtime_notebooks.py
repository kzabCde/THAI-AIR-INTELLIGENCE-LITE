#!/usr/bin/env python3
"""Build reviewed v5.6.2 Colab notebooks from the checked-in templates."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PRODUCTION_TEMPLATE = Path("/tmp/train_all_6_models_pm25_drive.ipynb")
SAFE_NOTEBOOKS = (
    ROOT / "training/train_dual_models_pm25.ipynb",
    ROOT / "training/train_all_6_models_pm25.ipynb",
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


def build_production(approved_sha: str, output: Path) -> None:
    if len(approved_sha) != 40:
        raise ValueError("--approved-sha must be a full 40-character commit SHA")
    notebook = json.loads(PRODUCTION_TEMPLATE.read_text(encoding="utf-8"))
    for cell in notebook["cells"]:
        text = "".join(cell.get("source", []))
        text = text.replace("v5.6.1", "v5.6.2")
        text = text.replace("production-v5.6.1", "production-v5.6.2")
        cell["source"] = _source(text)

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
    _clear_outputs(notebook)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(notebook, ensure_ascii=False, indent=1) + "\n",
        encoding="utf-8",
    )


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
