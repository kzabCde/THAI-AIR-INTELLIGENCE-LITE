import ast
import json
import subprocess
import sys
from pathlib import Path


CANONICAL_NOTEBOOK = Path("training/train_models_pm25_v5_6_4.ipynb")
BUILDER = Path("scripts/build_runtime_notebooks.py")


def _cell_source(notebook: dict, cell_id: str) -> str:
    for cell in notebook["cells"]:
        if cell.get("metadata", {}).get("id") == cell_id:
            return "".join(cell.get("source", []))
    raise AssertionError(f"missing notebook cell: {cell_id}")


def _assert_code_cells_clean(notebook: dict) -> None:
    for cell in notebook["cells"]:
        if cell.get("cell_type") != "code":
            continue
        assert cell.get("execution_count") is None
        assert cell.get("outputs") == []
        ast.parse("".join(cell.get("source", [])))


def _assert_v5_6_4_notebook_contract(notebook: dict, *, production: bool) -> None:
    intro = _cell_source(notebook, "intro")
    configuration = _cell_source(notebook, "configuration")
    preflight = _cell_source(notebook, "secrets_preflight")
    train = _cell_source(notebook, "train")
    regression_report = _cell_source(notebook, "regression_report")
    regression_chart = _cell_source(notebook, "regression_skill_chart")
    classification_report = _cell_source(notebook, "classification_report")
    horizon_chart = _cell_source(notebook, "horizon_chart")
    class_chart = _cell_source(notebook, "class_metrics_chart")
    confusion_chart = _cell_source(notebook, "confusion_matrix_chart")

    assert "PM2.5 v5.6.4 DB-only Trainer" in intro
    assert "training_daily_summary_v3" in intro
    assert "zero Open-Meteo/CAMS archive network reads" in intro
    assert "D+2–D+7" in intro
    assert "Classes 2–3" in intro
    assert "Classes 4–5" in intro

    assert 'TRAINER_VERSION = "5.6.4"' in configuration
    assert 'SOURCE_OF_TRUTH = "training_daily_summary_v3"' in configuration
    assert 'FEATURE_VERSION = "daily-pooled-v1"' in configuration
    assert "REGRESSION_SKILL_GATE = 0.045" in configuration
    assert f"DRY_RUN = {not production}" in configuration
    assert f"ALLOW_PRODUCTION_PROMOTION = {production}" in configuration

    assert "from training.train_models_pm25_v5_6_4 import _preflight" in preflight
    assert 'preflight["network_archive_reads"] != 0' in preflight
    assert '"training.train_models_pm25_v5_6_4"' in train
    if production:
        assert 'command.append("--dry-run")' in train
        # The branch is controlled by DRY_RUN=False; the command does not force
        # an unconditional activation, it uses the trainer's safe promotion gate.
    else:
        assert 'command.append("--dry-run")' in train

    assert "v5_6_4_regression_eligibility.csv" in regression_report
    assert "failed_provinces" in regression_report
    assert "margin_to_gate_percentage_points" in regression_report
    assert "Strict gate 4.5%" in regression_chart
    assert "skill_percent" in regression_chart

    assert "v5_6_4_classification_focus.json" in classification_report
    assert "v5_6_4_chart_data.json" in classification_report
    assert "class_2_3_mean_f1" in classification_report
    assert "critical_class_recall" in classification_report
    assert "Regression MAE by Forecast Horizon" in horizon_chart
    assert 'metric_names = ["precision", "recall", "f1"]' in class_chart
    assert "Random Forest Confusion Matrix" in confusion_chart
    assert "imshow(confusion)" in confusion_chart

    notebook_text = json.dumps(notebook, ensure_ascii=False)
    assert "archive-api.open-meteo.com" not in notebook_text
    assert "air-quality-api.open-meteo.com" not in notebook_text
    assert "ARCHIVE_CACHE_DIRECTORY" not in notebook_text
    assert "fetch_archive_daily" not in notebook_text

    assert notebook["metadata"]["source_of_truth"] == "training_daily_summary_v3"
    assert notebook["metadata"]["notebook_version"] == "5.6.4-db-only-guarded-tuning"
    assert notebook["metadata"]["colab"]["machine_shape"] == "hm"
    _assert_code_cells_clean(notebook)


def test_checked_in_canonical_notebook_is_safe_db_only_and_has_charts():
    notebook = json.loads(CANONICAL_NOTEBOOK.read_text(encoding="utf-8"))
    _assert_v5_6_4_notebook_contract(notebook, production=False)


def test_builder_generates_reviewed_production_notebook(tmp_path):
    approved_sha = "a" * 40
    output = tmp_path / "production.ipynb"
    subprocess.run(
        [
            sys.executable,
            str(BUILDER),
            "--approved-sha",
            approved_sha,
            "--production-output",
            str(output),
        ],
        check=True,
    )
    notebook = json.loads(output.read_text(encoding="utf-8"))
    assert notebook["metadata"]["approved_code_sha"] == approved_sha
    assert f'APPROVED_CODE_SHA = "{approved_sha}"' in _cell_source(
        notebook, "configuration"
    )
    _assert_v5_6_4_notebook_contract(notebook, production=True)


def test_builder_source_has_no_legacy_archive_or_v5_6_3_checkpoint_contract():
    source = BUILDER.read_text(encoding="utf-8")
    assert "training.train_models_pm25_v5_6_4" in source
    assert "training_daily_summary_v3" in source
    assert "v5_6_4_regression_eligibility.csv" in source
    assert "v5_6_4_classification_focus.json" in source
    assert "regression_skill_chart" in source
    assert "horizon_chart" in source
    assert "class_metrics_chart" in source
    assert "confusion_matrix_chart" in source
    for stale in (
        "ARCHIVE_CACHE_DIRECTORY",
        "ARCHIVE_REQUEST_MIN_INTERVAL_SECONDS",
        "pm25_v5_6_3",
        "TRAINING_CHECKPOINT_COMPATIBILITY_SHA",
        "fetch_archive_daily",
        "archive-api.open-meteo.com",
        "air-quality-api.open-meteo.com",
    ):
        assert stale not in source
