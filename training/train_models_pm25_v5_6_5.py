#!/usr/bin/env python3
"""PM2.5 v5.6.5 data-safe Colab/research entrypoint.

v5.6.5 intentionally reuses the reviewed v5.6.4 LightGBM + Random Forest
training, tuning, gating, champion/challenger, registration and activation
logic unchanged. The only additions are data-snapshot auditing, exact-snapshot
checkpoint isolation for Colab, and report-only visualization sidecars.

The Production v5.6.4 entrypoint and scheduled workflow are not modified by
this module.
"""

from __future__ import annotations

import json

import training.monthly_auto_retrain as monthly
from training.train_models_pm25_v5_6_4 import _preflight as _v5_6_4_preflight
from training.v5_6_4_stability_hotfix import (
    TUNING_REVISION,
    install_into_monthly_retrainer as install_v5_6_4_tuning,
)
from training.v5_6_5_data_safety import (
    DATA_SAFETY_REVISION,
    SNAPSHOT_SCHEMA,
    install_into_monthly_retrainer as install_v5_6_5_data_safety,
)

TRAINER_VERSION = "5.6.5"
TRAINER_REVISION = "v5.6.4-model-logic-plus-fresh-data-safety"


def _preflight() -> dict:
    base = _v5_6_4_preflight()
    return {
        **base,
        "trainer_version": TRAINER_VERSION,
        "trainer_revision": TRAINER_REVISION,
        "model_logic_version": "5.6.4-unchanged",
        "tuning_revision": TUNING_REVISION,
        "data_safety_revision": DATA_SAFETY_REVISION,
        "snapshot_schema": SNAPSHOT_SCHEMA,
        "fresh_data_snapshot_fingerprint": True,
        "snapshot_safe_checkpoints": True,
        "checkpoint_resume_rule": (
            "same snapshot + same feature version + same code SHA + same tuning revision only"
        ),
        "stale_checkpoint_resume_allowed": False,
        "register_activate_logic_changed": False,
        "production_v5_6_4_entrypoint_changed": False,
        "training_mode": "v5.6.4_model_logic_with_v5.6.5_data_safety",
    }


def main() -> int:
    preflight = _preflight()
    print(json.dumps({"pm25_v5_6_5_preflight": preflight}, ensure_ascii=False))

    # Order is intentional. First install the exact reviewed v5.6.4 tuning
    # functions, then wrap those functions with data/checkpoint/report safety.
    install_v5_6_4_tuning()
    install_v5_6_5_data_safety()
    return monthly.main()


if __name__ == "__main__":
    raise SystemExit(main())
