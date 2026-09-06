#!/usr/bin/env python3
"""Canonical fresh PM2.5 trainer for reviewed model version 5.6.4.

This entrypoint keeps the reviewed v5.6.4 production contracts while using the
current Supabase-only source of truth. Every invocation trains a fresh dual
challenger from ``training_daily_summary_v3`` and installs the reviewed guarded
v5.6.4 tuning layer before the champion/challenger workflow starts.

The tuning layer is deliberately conservative:
- LightGBM re-tuning is selected on Validation only and must improve D+1 while
  preserving D+2..D+7 inside explicit MAE guards.
- Random Forest alternatives emphasize Classes 2 and 3 on purged walk-forward
  CV, but are rejected if Class 4/5 recall or overall validation quality falls
  outside the reviewed guard.
- Test remains evaluation-only; it is never used to select a tuning profile.

The active feature schema remains ``daily-pooled-v1``. Fire features
(``hotspot_count`` and ``total_frp``) remain behind the
``daily-pooled-v2-fire`` gate until lineage-complete non-synthetic FIRMS history
is available. Production promotion stays atomic and conservative: a challenger
can replace the champion only when the existing same-holdout policy approves
it and all deployment gates pass.
"""

from __future__ import annotations

import json

from training.db_training_data import TRAINING_VIEW
from training.dual_model_config import (
    POOLED_FEATURE_COLUMNS,
    POOLED_FEATURE_VERSION,
    POOLED_FEATURE_VERSION_NEXT,
    POOLED_FIRE_FEATURE_COLUMNS,
    POOLED_PROVINCE_IDS,
)
from training.monthly_auto_retrain import main as run_fresh_db_only_training
from training.v5_6_4_tuning import TUNING_REVISION, install_into_monthly_retrainer

TRAINER_VERSION = "5.6.4"
TRAINER_REVISION = "db-only-fresh-guarded-tuning"
EXPECTED_TRAINING_VIEW = "training_daily_summary_v3"
EXPECTED_ACTIVE_FEATURE_VERSION = "daily-pooled-v1"
EXPECTED_NEXT_FIRE_FEATURE_VERSION = "daily-pooled-v2-fire"
EXPECTED_PROVINCES = 20


def _preflight() -> dict:
    """Fail closed if the reviewed v5.6.4 training contract drifts."""
    if TRAINING_VIEW != EXPECTED_TRAINING_VIEW:
        raise RuntimeError(
            f"v5.6.4 requires {EXPECTED_TRAINING_VIEW}; found {TRAINING_VIEW}"
        )
    if POOLED_FEATURE_VERSION != EXPECTED_ACTIVE_FEATURE_VERSION:
        raise RuntimeError(
            "v5.6.4 active feature contract changed unexpectedly: "
            f"{POOLED_FEATURE_VERSION}"
        )
    if POOLED_FEATURE_VERSION_NEXT != EXPECTED_NEXT_FIRE_FEATURE_VERSION:
        raise RuntimeError(
            "next fire-feature contract changed unexpectedly: "
            f"{POOLED_FEATURE_VERSION_NEXT}"
        )
    if len(POOLED_PROVINCE_IDS) != EXPECTED_PROVINCES:
        raise RuntimeError(
            f"v5.6.4 requires {EXPECTED_PROVINCES} provinces; "
            f"found {len(POOLED_PROVINCE_IDS)}"
        )
    if any(feature in POOLED_FEATURE_COLUMNS for feature in POOLED_FIRE_FEATURE_COLUMNS):
        raise RuntimeError(
            "hotspot_count/total_frp must not enter active v5.6.4 training before "
            "the trusted FIRMS history gate is satisfied"
        )

    return {
        "trainer_version": TRAINER_VERSION,
        "trainer_revision": TRAINER_REVISION,
        "tuning_revision": TUNING_REVISION,
        "source_of_truth": TRAINING_VIEW,
        "network_archive_reads": 0,
        "active_feature_version": POOLED_FEATURE_VERSION,
        "active_feature_count": len(POOLED_FEATURE_COLUMNS),
        "next_feature_version": POOLED_FEATURE_VERSION_NEXT,
        "fire_features_active": False,
        "fire_features_gated": list(POOLED_FIRE_FEATURE_COLUMNS),
        "provinces": len(POOLED_PROVINCE_IDS),
        "training_mode": "fresh_champion_challenger_guarded_tuning",
        "selection_data": "training_and_validation_only",
        "test_role": "evaluation_and_same_holdout_promotion_only",
        "promotion_mode": "same_holdout_safe_atomic",
    }


def main() -> int:
    preflight = _preflight()
    print(json.dumps({"pm25_v5_6_4_preflight": preflight}, ensure_ascii=False))
    install_into_monthly_retrainer()
    return run_fresh_db_only_training()


if __name__ == "__main__":
    raise SystemExit(main())
