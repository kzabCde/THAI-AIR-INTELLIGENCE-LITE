#!/usr/bin/env python3
"""Canonical fresh PM2.5 trainer for reviewed model version 5.6.4.

This entrypoint keeps the reviewed v5.6.4 model contract while replacing the
old Colab-era in-memory Open-Meteo archive path with the current Supabase-only
training source of truth. Every invocation trains a fresh LightGBM regression
challenger and pooled Random Forest classification challenger from
``training_daily_summary_v3`` through ``training.monthly_auto_retrain``.

The active feature schema remains ``daily-pooled-v1``. Fire features
(``hotspot_count`` and ``total_frp``) are intentionally kept behind the
``daily-pooled-v2-fire`` gate until lineage-complete non-synthetic FIRMS history
is available. Promotion remains conservative: the current Production champion
is replaced atomically only when the existing champion/challenger policy
approves the new candidate on the same latest 365-day D+1 holdout.
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

TRAINER_VERSION = "5.6.4"
TRAINER_REVISION = "db-only-fresh"
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
        "source_of_truth": TRAINING_VIEW,
        "network_archive_reads": 0,
        "active_feature_version": POOLED_FEATURE_VERSION,
        "active_feature_count": len(POOLED_FEATURE_COLUMNS),
        "next_feature_version": POOLED_FEATURE_VERSION_NEXT,
        "fire_features_active": False,
        "fire_features_gated": list(POOLED_FIRE_FEATURE_COLUMNS),
        "provinces": len(POOLED_PROVINCE_IDS),
        "training_mode": "fresh_champion_challenger",
        "promotion_mode": "same_holdout_safe_atomic",
    }


def main() -> int:
    preflight = _preflight()
    print(json.dumps({"pm25_v5_6_4_preflight": preflight}, ensure_ascii=False))
    return run_fresh_db_only_training()


if __name__ == "__main__":
    raise SystemExit(main())
