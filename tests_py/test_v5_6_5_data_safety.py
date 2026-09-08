from __future__ import annotations

import os
from pathlib import Path

import pandas as pd

from training.dual_model_config import POOLED_PROVINCE_IDS
from training.v5_6_5_data_safety import (
    DATA_SAFETY_REVISION,
    SNAPSHOT_SCHEMA,
    build_training_snapshot,
)


def _observed(days: int = 3) -> pd.DataFrame:
    rows = []
    for province_index, province_id in enumerate(POOLED_PROVINCE_IDS):
        for day in range(days):
            rows.append(
                {
                    "province_id": province_id,
                    "date": pd.Timestamp("2026-01-01") + pd.Timedelta(days=day),
                    "trusted_hours": 24,
                    "trusted_sources": ["test"],
                    "data_origin": "unit-test",
                    "lineage_version": "unit-test-v1",
                    "air_request_id": f"air-{province_id}-{day}",
                    "weather_request_id": f"weather-{province_id}-{day}",
                    "pm25_mean": 10.0 + province_index + day,
                    "temp_mean": 30.0 + day,
                    "humidity_mean": 60.0,
                    "wind_speed_mean": 2.0,
                    "precip_total": 0.0,
                }
            )
    return pd.DataFrame(rows)


def _audit() -> dict:
    return {
        "source_of_truth": "training_daily_summary_v3",
        "network_archive_reads": 0,
    }


def test_snapshot_is_stable_when_row_order_changes() -> None:
    frame = _observed()
    first = build_training_snapshot(frame, _audit(), code_sha="a" * 40)
    second = build_training_snapshot(
        frame.sample(frac=1.0, random_state=42).reset_index(drop=True),
        _audit(),
        code_sha="a" * 40,
    )
    assert first["schema"] == SNAPSHOT_SCHEMA
    assert first["snapshot_id"] == second["snapshot_id"]
    assert first["content_sha256"] == second["content_sha256"]
    assert first["quality"]["hard_contract_passed"] is True


def test_new_source_value_forces_new_snapshot() -> None:
    frame = _observed()
    first = build_training_snapshot(frame, _audit(), code_sha="a" * 40)
    changed = frame.copy()
    changed.loc[0, "pm25_mean"] = float(changed.loc[0, "pm25_mean"]) + 1.0
    second = build_training_snapshot(changed, _audit(), code_sha="a" * 40)
    assert first["snapshot_id"] != second["snapshot_id"]
    assert first["checkpoint_namespace"] != second["checkpoint_namespace"]


def test_code_change_invalidates_checkpoint_contract_without_changing_data_identity() -> None:
    frame = _observed()
    first = build_training_snapshot(frame, _audit(), code_sha="a" * 40)
    second = build_training_snapshot(frame, _audit(), code_sha="b" * 40)
    assert first["snapshot_id"] == second["snapshot_id"]
    assert first["checkpoint_contract_id"] != second["checkpoint_contract_id"]
    assert first["checkpoint_namespace"] != second["checkpoint_namespace"]
    assert first["stale_checkpoint_resume_allowed"] is False


def test_quality_report_surfaces_cross_province_freshness_gap() -> None:
    frame = _observed(days=4)
    first_province = POOLED_PROVINCE_IDS[0]
    frame = frame[
        ~(
            (frame["province_id"] == first_province)
            & (frame["date"] >= pd.Timestamp("2026-01-03"))
        )
    ].copy()
    snapshot = build_training_snapshot(frame, _audit(), code_sha="a" * 40)
    assert snapshot["quality"]["province_latest_date_spread_days"] == 2
    assert "province_latest_date_spread:2d" in snapshot["quality"]["warnings"]


def test_v565_entrypoint_is_orchestration_only() -> None:
    source = (Path(__file__).resolve().parents[1] / "training/train_models_pm25_v5_6_5.py").read_text(
        encoding="utf-8"
    )
    assert "install_v5_6_4_tuning()" in source
    assert "install_v5_6_5_data_safety()" in source
    assert "monthly.main()" in source
    assert "model_logic_version\": \"5.6.4-unchanged" in source
    assert DATA_SAFETY_REVISION == "v5.6.5-fresh-data-safety-v1"
