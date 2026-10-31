"""Unit tests for standard atomic activation plan decisions (no network writes)."""
from __future__ import annotations

import unittest

from training.activate_standard_models import (
    CLASSIFIER_MODEL,
    REGRESSION_MODEL,
    build_standard_plan,
)
from training.dual_model_config import POOLED_PROVINCE_IDS


def candidate(province, task, *, eligible=True, sha="a" * 64, artifact=True):
    return {
        "id": 999, "province_id": province, "task_type": task,
        "model_name": REGRESSION_MODEL if task == "regression" else CLASSIFIER_MODEL,
        "eligibility_status": eligible, "evidence_status": "validated",
        "feature_version": "daily-pooled-v1",
        "runtime_artifact_uri": "storage://model-artifacts/release/runtime.json.gz" if artifact else None,
        "runtime_artifact_sha256": sha,
        "runtime_artifact_byte_size": 1200,
        "runtime_artifact_format": "json+gzip",
    }


class StandardPlanTests(unittest.TestCase):
    def test_regression_promoted_without_classifier_shadow_quota(self):
        candidates = [candidate(pid, "regression") for pid in POOLED_PROVINCE_IDS]
        plan = build_standard_plan(POOLED_PROVINCE_IDS, candidates, [])
        self.assertEqual(len(plan), 40)
        self.assertEqual(sum(x["action"] == "activate_candidate" for x in plan), 20)
        self.assertEqual(sum(x["action"] == "deactivate_to_regression_threshold" for x in plan), 20)

    def test_ineligible_classification_never_activated(self):
        pid = POOLED_PROVINCE_IDS[0]
        plan = build_standard_plan(POOLED_PROVINCE_IDS, [
            candidate(pid, "classification", eligible=False)
        ], [])
        row = next(x for x in plan if x["province_id"] == pid and x["task_type"] == "classification")
        self.assertEqual(row["action"], "deactivate_to_regression_threshold")

    def test_preserve_active_incumbent_on_missing_or_ineligible_candidate(self):
        pid = POOLED_PROVINCE_IDS[0]
        active = [{"id": 111, "province_id": pid, "task_type": "regression"}]
        plan = build_standard_plan(POOLED_PROVINCE_IDS, [
            candidate(pid, "regression", eligible=False)
        ], active)
        row = next(x for x in plan if x["province_id"] == pid and x["task_type"] == "regression")
        self.assertEqual(row["action"], "hold_previous")

    def test_unverified_artifact_not_selected(self):
        pid = POOLED_PROVINCE_IDS[0]
        plan = build_standard_plan(POOLED_PROVINCE_IDS, [
            candidate(pid, "regression", sha="bad")
        ], [])
        row = next(x for x in plan if x["province_id"] == pid and x["task_type"] == "regression")
        self.assertEqual(row["action"], "deactivate_to_fallback")

    def test_same_active_registry_id_is_held(self):
        pid = POOLED_PROVINCE_IDS[0]
        row = candidate(pid, "regression")
        plan = build_standard_plan(POOLED_PROVINCE_IDS, [row], [row])
        target = next(x for x in plan if x["province_id"] == pid and x["task_type"] == "regression")
        self.assertEqual(target["action"], "hold_previous")

    def test_duplicate_candidate_rejected(self):
        row = candidate(POOLED_PROVINCE_IDS[0], "regression")
        with self.assertRaisesRegex(ValueError, "Ambiguous duplicate"):
            build_standard_plan(POOLED_PROVINCE_IDS, [row, row], [])

    def test_unexpected_province_list_rejected(self):
        with self.assertRaisesRegex(ValueError, "20 official"):
            build_standard_plan(["TH-30"], [], [])


if __name__ == "__main__":
    unittest.main()
