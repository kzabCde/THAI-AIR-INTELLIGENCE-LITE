"""Offline policy tests: no Supabase writes, deterministic 40-action plan."""
import unittest

from training.selective_activation import build_selective_activation_plan


class SelectivePromotionTests(unittest.TestCase):
    def rows(self, eligible=False):
        rows = []
        for index in range(30, 50):
            province = f"TH-{index}"
            for task in ("regression", "classification"):
                metrics = {"mae": 3.0, "skill_vs_persistence": 0.07} if task == "regression" else {
                    "macro_f1": 0.75, "metric_class_contract": [1, 2, 3, 4, 5],
                    "per_class": {"4": {"support": 10, "recall": 0.5}, "5": {"support": 5, "recall": 0.4}},
                }
                rows.append({
                    "province_id": province, "task_type": task,
                    "model_name": "lightgbm-pm25-residual-v2" if task == "regression" else "random-forest-aqi-classifier-pooled-v1",
                    "eligibility_status": eligible,
                    "evidence_status": "validated" if eligible else "ineligible",
                    "metrics": metrics, "test_rows": 365,
                })
        return rows

    def test_all_fallback(self):
        provinces = [f"TH-{i}" for i in range(30, 50)]
        plan, report = build_selective_activation_plan(provinces, self.rows(), {}, {})
        self.assertEqual(report["activation_count"], 0)
        self.assertEqual(report["fallback_count"], 40)
        self.assertEqual(len(plan), 40)

    def test_partial_bootstrap_holds_champion(self):
        provinces = [f"TH-{i}" for i in range(30, 50)]
        active = {"regression": {"TH-30": {"run_id": "old"}}, "classification": {}}
        rows = self.rows(eligible=True)
        plan, report = build_selective_activation_plan(provinces, rows, active, {})
        self.assertEqual(report["activation_count"], 39)
        self.assertEqual(report["hold_count"], 1)

    def test_champion_only_replaced_if_better_on_same_holdout(self):
        provinces = [f"TH-{i}" for i in range(30, 50)]
        active = {"regression": {"TH-30": {"run_id": "old"}}, "classification": {}}
        scores = {"regression": {"TH-30": {"same_holdout": True, "mae": 5.0, "test_rows": 365}}}
        plan, _ = build_selective_activation_plan(provinces, self.rows(eligible=True), active, scores)
        match = next(p for p in plan if p["province_id"] == "TH-30" and p["task_type"] == "regression")
        self.assertEqual(match["action"], "activate_candidate")
        scores["regression"]["TH-30"]["mae"] = 2.0
        plan, _ = build_selective_activation_plan(provinces, self.rows(eligible=True), active, scores)
        match = next(p for p in plan if p["province_id"] == "TH-30" and p["task_type"] == "regression")
        self.assertEqual(match["action"], "hold_previous")

    def test_rejected_critical_class_never_promotes(self):
        provinces = [f"TH-{i}" for i in range(30, 50)]
        rows = self.rows(eligible=True)
        for row in rows:
            if row["task_type"] == "classification":
                row["metrics"]["per_class"]["5"]["support"] = 0
        _, report = build_selective_activation_plan(provinces, rows, {}, {})
        self.assertEqual(report["activation_count"], 20)


if __name__ == "__main__":
    unittest.main()
