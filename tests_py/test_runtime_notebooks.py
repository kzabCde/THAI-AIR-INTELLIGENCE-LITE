import ast
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import pandas as pd
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


def _load_archive_helpers(tmp_path: Path) -> dict:
    notebook = json.loads(PRODUCTION_TEMPLATE.read_text(encoding="utf-8"))
    source = _cell_source(notebook, "fetch_quality").split("\nsb = get_client()", 1)[0]
    namespace = {
        "ARCHIVE_CACHE_DIRECTORY": str(tmp_path / "archive-cache"),
        "ARCHIVE_REQUEST_TIMEOUT_SECONDS": 1,
        "ARCHIVE_REQUEST_MIN_INTERVAL_SECONDS": 0.0,
        "ARCHIVE_MAX_ATTEMPTS": 2,
        "ARCHIVE_MAX_BACKOFF_SECONDS": 300.0,
        "ARCHIVE_CHUNK_DAYS": 365,
        "ARCHIVE_PROVINCE_BATCH_SIZE": 5,
        "math": __import__("math"),
        "np": np,
        "pd": pd,
    }
    exec(compile(source, "<fetch_quality>", "exec"), namespace)
    return namespace


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
    classification = _cell_source(notebook, "train_classification")
    eligibility = _cell_source(notebook, "eligibility")
    artifacts = _cell_source(notebook, "artifacts")
    verify_active = _cell_source(notebook, "verify_active")
    forecast = _cell_source(notebook, "forecast_verify")

    assert f'APPROVED_CODE_SHA = "{approved_sha}"' in configuration
    assert 'os.environ["CUDA_VISIBLE_DEVICES"] = ""' in configuration
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
    assert "TRAINING_CHECKPOINT_DIRECTORY = (" in configuration
    assert "DEPLOYMENT_CHECKPOINT_DIRECTORY = (" in configuration
    assert "/MyDrive/THAI-AIR-INTELLIGENCE-LITE/" in configuration
    assert (
        'TRAINING_CHECKPOINT_COMPATIBILITY_SHA = '
        '"b4436227a2471e65c40fae1515deabb3bf880c7f"'
    ) in configuration
    assert (
        'f"checkpoints/pm25_v5_6_3/{TRAINING_CHECKPOINT_COMPATIBILITY_SHA}"'
        in configuration
    )
    assert 'f"checkpoints/pm25_v5_6_4/{APPROVED_CODE_SHA}"' in configuration
    assert (
        'ARTIFACT_DIRECTORY = f"{DEPLOYMENT_CHECKPOINT_DIRECTORY}/artifacts"'
        in configuration
    )
    assert (
        'ARCHIVE_CACHE_DIRECTORY = f"{TRAINING_CHECKPOINT_DIRECTORY}/archive_cache"'
        in configuration
    )
    assert "REGRESSION_MINIMUM_SKILL = 0.045" in configuration
    assert "REGRESSION_CONDITIONAL_FLOOR = 0.0445" in configuration
    assert 'REGRESSION_CONDITIONAL_PROVINCES = ("TH-34",)' in configuration
    assert "MINIMUM_RECOMMENDED_RAM_GB = 24.0" in configuration
    assert "ARCHIVE_REQUEST_MIN_INTERVAL_SECONDS = 15.0" in configuration
    assert "ARCHIVE_MAX_ATTEMPTS = 8" in configuration
    assert "ARCHIVE_MAX_BACKOFF_SECONDS = 300.0" in configuration
    assert "POOLED_MINIMUM_ORIGIN_DAYS" in imports
    assert "cv_splits=CV_SPLITS" in imports
    assert "drive.mount(DRIVE_MOUNT_POINT" in imports
    assert 'TRAINING_CHECKPOINT_SCHEMA = "pm25-residual-v5.6.3"' in imports
    assert 'DEPLOYMENT_CHECKPOINT_SCHEMA = "pm25-deployment-v5.6.4"' in imports
    assert "TRAINING_STAGE_CHECKPOINT_DIRECTORY" in imports
    assert "DEPLOYMENT_STAGE_CHECKPOINT_DIRECTORY" in imports
    assert "REGRESSION_CHECKPOINT_DIRECTORY" in imports
    assert "CLASSIFICATION_FOLD_CHECKPOINT_DIRECTORY" in imports
    assert "CLASSIFICATION_PROVINCE_CHECKPOINT_DIRECTORY" in imports
    assert "os.replace(temporary, target)" in imports
    assert "def _split_fingerprint(split):" in imports
    assert "Checkpoint belongs to another chronological split" in imports
    assert "evaluate_regression_deployment_policy" in imports
    assert '"database_writes": 0' in archive
    assert "ARCHIVE_START_DATE" in archive
    assert "in memory" in archive.lower() or "archive_daily" in archive
    assert '"daily": ",".join(ARCHIVE_DAILY_WEATHER_VARIABLES)' in archive
    assert '"hourly": ",".join(ARCHIVE_WEATHER_VARIABLES)' not in archive
    assert "ARCHIVE_CACHE_PATH" in archive
    assert "gzip.open" in archive
    assert 'response.status_code == 429' in archive
    assert 'response.headers.get("Retry-After")' in archive
    assert "time.monotonic()" in archive
    assert 'split_origin_dates["validation"] != FULL_YEAR_HOLDOUT_DAYS' in split
    assert 'split_origin_dates["test"] != FULL_YEAR_HOLDOUT_DAYS' in split
    assert "2 * POOLED_EMBARGO_DAYS" in split
    assert "training_split_fingerprint = _split_fingerprint(split)" in split
    assert '"local_eligible", "global_gate_eligible"' in regression
    assert "province_results=completed_regression_provinces" in regression
    assert "on_province_complete=_save_regression_province" in regression
    assert "already complete; skipped all 20 province fits" in regression
    assert "cv_fold_results=completed_classification_folds" in classification
    assert "on_cv_fold_complete=_save_classification_fold" in classification
    assert '"rf_parameter_candidates": 1' in classification
    assert "regression_failure_reasons" in eligibility
    assert "strict_regression_global_eligible" in eligibility
    assert 'metrics["strict_eligible"]' in eligibility
    assert 'metrics["deployment_eligible"]' in eligibility
    assert 'metrics["activation_tier"]' in eligibility
    assert '"research_reporting_note"' in eligibility
    assert "regression_conditional_provinces" in eligibility
    assert "regression=regression" in eligibility
    assert "classification_deployment_reasons" in eligibility
    assert "no Registry or activation write was made" in eligibility
    assert '"production_writes": 0' in artifacts
    assert '"conditional_policy_selected_after_test_observation": True' in artifacts
    assert 'row["model_params"]["activation_tier"]' in artifacts
    assert "Expected 40 active rows" in verify_active
    assert "expected_forecast_rows" in forecast
    assert "PRODUCTION_REQUIRED_PROVINCES * FORECAST_HORIZON_DAYS" in forecast

    assert "accelerator" not in notebook["metadata"]
    assert notebook["metadata"]["colab"]["machine_shape"] == "hm"
    assert notebook["metadata"]["notebook_version"] == "5.6.4-production"

    assert len(notebook["cells"]) == 17
    for cell in notebook["cells"]:
        if cell.get("cell_type") != "code":
            continue
        assert cell.get("execution_count") is None
        assert cell.get("outputs") == []
        ast.parse("".join(cell.get("source", [])))


def test_archive_request_respects_429_and_reuses_successful_cache(tmp_path, monkeypatch):
    helpers = _load_archive_helpers(tmp_path)

    class Response:
        def __init__(self, status_code, payload, headers=None):
            self.status_code = status_code
            self._payload = payload
            self.headers = headers or {}

        def raise_for_status(self):
            if self.status_code >= 400:
                raise helpers["requests"].HTTPError(f"HTTP {self.status_code}")

        def json(self):
            return self._payload

    class Session:
        def __init__(self):
            self.responses = [
                Response(429, {"error": True}, {"Retry-After": "1"}),
                Response(200, {"daily": {"time": ["2024-01-01"]}}),
            ]
            self.calls = 0

        def get(self, *_args, **_kwargs):
            self.calls += 1
            return self.responses.pop(0)

    sleeps = []
    monkeypatch.setattr(helpers["time"], "sleep", sleeps.append)
    session = Session()
    helpers["ARCHIVE_SESSION"] = session
    payload = helpers["_request_json"]("https://example.invalid", {"x": "1"})

    assert payload == {"daily": {"time": ["2024-01-01"]}}
    assert session.calls == 2
    assert 60.0 in sleeps

    helpers["ARCHIVE_SESSION"] = None
    assert helpers["_request_json"]("https://example.invalid", {"x": "1"}) == payload


def test_archive_daily_weather_maps_api_aggregates_to_model_features(tmp_path):
    helpers = _load_archive_helpers(tmp_path)
    frame = helpers["_daily_weather"](
        {
            "daily": {
                "time": ["2024-01-01", "2024-01-02"],
                "temperature_2m_mean": [30.0, 31.0],
                "relative_humidity_2m_mean": [70.0, 65.0],
                "wind_speed_10m_mean": [8.0, 9.0],
                "surface_pressure_mean": [1005.0, 1004.0],
                "precipitation_sum": [0.0, 2.5],
            }
        },
        "TH-30",
    )

    assert list(frame.columns) == [
        "province_id",
        "date",
        "temp_mean",
        "humidity_mean",
        "wind_speed_mean",
        "pressure_mean",
        "precip_total",
    ]
    assert frame["province_id"].tolist() == ["TH-30", "TH-30"]
    assert frame["precip_total"].tolist() == [0.0, 2.5]
