from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from training.v5_6_4_stability_hotfix import (
    CLASSIFICATION_CANDIDATES_V2,
    REGRESSION_REQUIRED_IMPROVED_SEGMENTS,
    REGRESSION_SEGMENT_NONINFERIOR_TOLERANCE,
    REGRESSION_VALIDATION_SEGMENTS,
    TUNING_REVISION,
    _d1_segment_ratios,
    _segments_are_stable,
)


def test_stability_revision_and_candidate_contract():
    assert TUNING_REVISION == "v5.6.4-guarded-tuning-v2-stability"
    assert REGRESSION_VALIDATION_SEGMENTS == 4
    assert REGRESSION_REQUIRED_IMPROVED_SEGMENTS == 3
    assert len(CLASSIFICATION_CANDIDATES_V2) >= 6
    assert any(candidate["max_features"] == 0.50 for candidate in CLASSIFICATION_CANDIDATES_V2)


def test_temporal_segment_guard_accepts_three_stable_improvements():
    ratios = [0.98, 0.99, 0.995, 1.0 + REGRESSION_SEGMENT_NONINFERIOR_TOLERANCE]
    assert _segments_are_stable(ratios)


def test_temporal_segment_guard_rejects_one_bad_quarter():
    ratios = [0.97, 0.98, 0.99, 1.0 + REGRESSION_SEGMENT_NONINFERIOR_TOLERANCE + 1e-6]
    assert not _segments_are_stable(ratios)


def test_segment_ratios_are_chronological_and_d1_only():
    dates = pd.date_range("2025-01-01", periods=8, freq="D")
    rows = []
    for date in dates:
        rows.append({"date": date, "forecast_horizon_days": 1, "target_pm25": 10.0})
        rows.append({"date": date, "forecast_horizon_days": 2, "target_pm25": 50.0})
    frame = pd.DataFrame(rows)
    baseline = np.asarray([12.0 if h == 1 else 50.0 for h in frame["forecast_horizon_days"]])
    candidate = np.asarray([11.0 if h == 1 else 100.0 for h in frame["forecast_horizon_days"]])
    ratios = _d1_segment_ratios(frame, candidate, baseline)
    assert ratios == pytest.approx([0.5, 0.5, 0.5, 0.5])


def test_second_pass_selection_contract_is_test_blind_and_critical_recall_strict():
    source = Path("training/v5_6_4_stability_hotfix.py").read_text(encoding="utf-8")
    selection = source.split("def _regression_candidate_on_validation_v2", 1)[1].split(
        "def _write_regression_report_v2", 1
    )[0]
    assert "test_rows" not in selection
    assert "split.test" not in selection
    assert "base.CLASSIFICATION_CRITICAL_RECALL_TOLERANCE = 0.0" in source
    entrypoint = Path("training/train_models_pm25_v5_6_4.py").read_text(encoding="utf-8")
    assert "training.v5_6_4_stability_hotfix" in entrypoint
    assert '"test_role": "evaluation_and_same_holdout_promotion_only"' in entrypoint
