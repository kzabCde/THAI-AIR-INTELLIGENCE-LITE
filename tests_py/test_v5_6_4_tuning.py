from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from training.v5_6_4_tuning import (
    CLASSIFICATION_CRITICAL_RECALL_TOLERANCE,
    CLASSIFICATION_OVERALL_TOLERANCE,
    _classification_candidate_passes_cv_guard,
    _validation_regression_skill,
)


def _metrics(*, macro_f1=0.60, balanced=0.61, class4=0.62, class5=0.55):
    return {
        "macro_f1": macro_f1,
        "balanced_accuracy": balanced,
        "per_class": {
            "1": {"precision": 0.8, "recall": 0.8, "f1": 0.8, "support": 100},
            "2": {"precision": 0.5, "recall": 0.5, "f1": 0.5, "support": 100},
            "3": {"precision": 0.5, "recall": 0.5, "f1": 0.5, "support": 100},
            "4": {"precision": 0.6, "recall": class4, "f1": 0.61, "support": 100},
            "5": {"precision": 0.6, "recall": class5, "f1": 0.57, "support": 20},
        },
    }


def test_classification_guard_accepts_mid_class_work_when_critical_recall_is_preserved():
    baseline = _metrics()
    candidate = _metrics(
        macro_f1=baseline["macro_f1"] - CLASSIFICATION_OVERALL_TOLERANCE / 2,
        balanced=baseline["balanced_accuracy"] - CLASSIFICATION_OVERALL_TOLERANCE / 2,
        class4=baseline["per_class"]["4"]["recall"]
        - CLASSIFICATION_CRITICAL_RECALL_TOLERANCE / 2,
        class5=baseline["per_class"]["5"]["recall"]
        - CLASSIFICATION_CRITICAL_RECALL_TOLERANCE / 2,
    )
    candidate["per_class"]["2"]["f1"] = 0.56
    candidate["per_class"]["3"]["f1"] = 0.57
    assert _classification_candidate_passes_cv_guard(candidate, baseline)


@pytest.mark.parametrize("class_id", (4, 5))
def test_classification_guard_rejects_critical_recall_regression(class_id):
    baseline = _metrics()
    candidate = _metrics()
    candidate["per_class"][str(class_id)]["recall"] = (
        baseline["per_class"][str(class_id)]["recall"]
        - CLASSIFICATION_CRITICAL_RECALL_TOLERANCE
        - 1e-6
    )
    assert not _classification_candidate_passes_cv_guard(candidate, baseline)


def test_classification_guard_rejects_overall_metric_regression():
    baseline = _metrics()
    candidate = _metrics(
        macro_f1=baseline["macro_f1"] - CLASSIFICATION_OVERALL_TOLERANCE - 1e-6
    )
    assert not _classification_candidate_passes_cv_guard(candidate, baseline)


def test_validation_regression_skill_matches_mae_skill_definition():
    frame = pd.DataFrame(
        {
            "forecast_horizon_days": [1, 1, 2, 2],
            "target_pm25": [12.0, 18.0, 20.0, 25.0],
            "pm25_mean": [10.0, 20.0, 19.0, 24.0],
        }
    )
    predictions = np.asarray([11.0, 19.0, 20.0, 25.0], dtype=float)
    # Persistence D+1 MAE = 2.0, candidate D+1 MAE = 1.0 => 50% skill.
    assert _validation_regression_skill(frame, predictions) == pytest.approx(0.5)


def test_tuning_selection_contract_does_not_use_test_to_choose_profiles():
    source = Path("training/v5_6_4_tuning.py").read_text(encoding="utf-8")
    candidate_section = source.split("def _regression_candidate_on_validation", 1)[1].split(
        "def _refit_regression_candidate", 1
    )[0]
    assert "test_rows" not in candidate_section
    classification_cv_section = source.split("def _evaluate_rf_candidate_cv", 1)[1].split(
        "def _classification_candidate_passes_cv_guard", 1
    )[0]
    assert "split.test" not in classification_cv_section
    assert '"selection_data": "training_and_validation_only"' in Path(
        "training/train_models_pm25_v5_6_4.py"
    ).read_text(encoding="utf-8")
