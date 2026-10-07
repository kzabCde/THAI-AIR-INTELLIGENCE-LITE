#!/usr/bin/env python3
"""Fresh PM2.5 v6 trainer focused on direct D+1 through D+7 quality."""

from __future__ import annotations

import json

import training.monthly_auto_retrain as monthly
from training.db_training_data import TRAINING_VIEW
from training.dual_model_config import (
    POOLED_FEATURE_COLUMNS,
    POOLED_FEATURE_VERSION,
    POOLED_PROVINCE_IDS,
)
from training.train_pooled_models import MODEL_VERSION, REGRESSION_MODEL_NAME
from training.v5_6_5_data_safety import (
    DATA_SAFETY_REVISION,
    install_into_monthly_retrainer as install_data_safety,
)

TRAINER_VERSION = "6.0.0"
EXPECTED_TRAINING_VIEW = "training_daily_summary_v3"


def _preflight() -> dict:
    if TRAINING_VIEW != EXPECTED_TRAINING_VIEW:
        raise RuntimeError(
            f"v6 requires {EXPECTED_TRAINING_VIEW}; found {TRAINING_VIEW}"
        )
    if POOLED_FEATURE_VERSION != "daily-pooled-v1":
        raise RuntimeError(f"unexpected active feature version: {POOLED_FEATURE_VERSION}")
    if len(POOLED_PROVINCE_IDS) != 20:
        raise RuntimeError("v6 requires all 20 Isan provinces")
    return {
        "trainer_version": TRAINER_VERSION,
        "model_version": MODEL_VERSION,
        "regression_model": REGRESSION_MODEL_NAME,
        "source_of_truth": TRAINING_VIEW,
        "active_feature_version": POOLED_FEATURE_VERSION,
        "active_feature_count": len(POOLED_FEATURE_COLUMNS),
        "target_horizons": list(range(1, 8)),
        "selection_data": "training_and_validation_only",
        "regression_selection": "per_horizon_local_or_regional",
        "promotion_comparison": "same_365_day_d1_d7_holdout",
        "data_safety_revision": DATA_SAFETY_REVISION,
    }


def main() -> int:
    print(json.dumps({"pm25_v6_preflight": _preflight()}, ensure_ascii=False))
    install_data_safety()
    return monthly.main()


if __name__ == "__main__":
    raise SystemExit(main())
