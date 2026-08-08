import ast
import json
import subprocess
import sys
from pathlib import Path

import pytest


NOTEBOOKS = (
    Path("training/train_dual_models_pm25.ipynb"),
    Path("training/train_all_6_models_pm25.ipynb"),
)
PRODUCTION_TEMPLATE = Path(
    "training/templates/train_all_6_models_pm25_production_template.ipynb"
)


def _cell_source(notebook: dict, cell_id: str) -> str:
    for cell in notebook["cells"]:
        if cell.get("metadata", {}).get("id") == cell_id:
            return "".join(cell.get("source", []))
    raise AssertionError(f"missing notebook cell: {cell_id}")


@pytest.mark.parametrize("path", NOTEBOOKS)
def test_safe_notebooks_pin_v5_6_2_policy_and_have_no_stale_outputs(path):
    notebook = json.loads(path.read_text(encoding="utf-8"))
    configuration = _cell_source(notebook, "configuration")

    assert "MINIMUM_ROWS = 834" in configuration
    assert "CV_SPLITS = 5" in configuration
    assert "REGISTER = False" in configuration
    assert "ACTIVATE = False" in configuration

    for cell in notebook["cells"]:
        if cell.get("cell_type") != "code":
            continue
        assert cell.get("execution_count") is None
        assert cell.get("outputs") == []
        ast.parse("".join(cell.get("source", [])))


def test_production_template_is_safe_and_has_no_stale_outputs():
    notebook = json.loads(PRODUCTION_TEMPLATE.read_text(encoding="utf-8"))
    configuration = _cell_source(notebook, "configuration")
    archive = _cell_source(notebook, "fetch_quality")

    assert "REGISTER = False" in configuration
    assert "ACTIVATE = False" in configuration
    assert "RUN_FORECAST = False" in configuration
    assert '"database_writes": 0' in archive
    assert "Open-Meteo" in archive

    for cell in notebook["cells"]:
        if cell.get("cell_type") != "code":
            continue
        assert cell.get("execution_count") is None
        assert cell.get("outputs") == []
        ast.parse("".join(cell.get("source", [])))


def test_production_builder_pins_reviewed_policy_and_archive(tmp_path):
    approved_sha = "a" * 40
    output = tmp_path / "production.ipynb"
    subprocess.run(
        [
            sys.executable,
            "scripts/build_runtime_notebooks.py",
            "--approved-sha",
            approved_sha,
            "--production-output",
            str(output),
        ],
        check=True,
    )
    notebook = json.loads(output.read_text(encoding="utf-8"))
    configuration = _cell_source(notebook, "configuration")
    imports = _cell_source(notebook, "pipeline_imports")
    archive = _cell_source(notebook, "fetch_quality")
    split = _cell_source(notebook, "split_audit")
    regression = _cell_source(notebook, "train_regression")
    eligibility = _cell_source(notebook, "eligibility")
    artifacts = _cell_source(notebook, "artifacts")
    verify_active = _cell_source(notebook, "verify_active")
    forecast = _cell_source(notebook, "forecast_verify")

    assert f'APPROVED_CODE_SHA = "{approved_sha}"' in configuration
    assert "REGISTER = True" in configuration
    assert "ACTIVATE = True" in configuration
    assert "RUN_FORECAST = True" in configuration
    assert 'PROVINCE = "all"' in configuration
    assert "MINIMUM_ROWS = 834" in configuration
    assert "CV_SPLITS = 5" in configuration
    assert '"test_accuracy": 0.65' in configuration
    assert '"test_macro_f1": 0.50' in configuration
    assert '"test_balanced_accuracy": 0.50' in configuration
    assert '"test_weighted_f1": 0.60' in configuration
    assert '"critical_recall": 0.35' in configuration
    assert '"critical_support": 5' in configuration
    assert "POOLED_MINIMUM_ORIGIN_DAYS" in imports
    assert "cv_splits=CV_SPLITS" in imports
    assert '"database_writes": 0' in archive
    assert "ARCHIVE_START_DATE" in archive
    assert "in memory" in archive.lower() or "archive_daily" in archive
    assert 'split_origin_dates["validation"] != FULL_YEAR_HOLDOUT_DAYS' in split
    assert 'split_origin_dates["test"] != FULL_YEAR_HOLDOUT_DAYS' in split
    assert "2 * POOLED_EMBARGO_DAYS" in split
    assert '"local_eligible", "global_gate_eligible"' in regression
    assert "regression_failure_reasons" in eligibility
    assert "classification_deployment_reasons" in eligibility
    assert "no Registry or activation write was made" in eligibility
    assert '"production_writes": 0' in artifacts
    assert "Expected 40 active rows" in verify_active
    assert "expected_forecast_rows" in forecast
    assert "PRODUCTION_REQUIRED_PROVINCES * FORECAST_HORIZON_DAYS" in forecast

    assert len(notebook["cells"]) == 17
    for cell in notebook["cells"]:
        if cell.get("cell_type") != "code":
            continue
        assert cell.get("execution_count") is None
        assert cell.get("outputs") == []
        ast.parse("".join(cell.get("source", [])))
