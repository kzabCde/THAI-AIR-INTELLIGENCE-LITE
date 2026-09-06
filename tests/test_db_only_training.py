from __future__ import annotations

import ast
import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]


def assigned_string(source: str, name: str) -> str:
    tree = ast.parse(source)
    for node in tree.body:
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == name:
                    return ast.literal_eval(node.value)
    raise AssertionError(f"assignment not found: {name}")


class DbOnlyTrainingContractTests(unittest.TestCase):
    def test_monthly_retrain_has_no_open_meteo_archive_dependency(self) -> None:
        source = (ROOT / "training/monthly_auto_retrain.py").read_text(encoding="utf-8")
        forbidden = (
            "fetch_archive_daily",
            "monthly_archive",
            "archive-cache-dir",
            "open-meteo-monthly",
            "air-quality-api.open-meteo.com",
            "archive-api.open-meteo.com",
        )
        for token in forbidden:
            self.assertNotIn(token, source)
        self.assertIn("prepare_db_training_data", source)
        self.assertIn('"network_archive_reads"', source)

    def test_monthly_workflow_has_no_archive_cache(self) -> None:
        workflow = (ROOT / ".github/workflows/pm25-monthly-auto-retrain.yml").read_text(
            encoding="utf-8"
        )
        self.assertNotIn("actions/cache", workflow)
        self.assertNotIn("open-meteo-monthly", workflow)
        self.assertNotIn("archive-cache-dir", workflow)
        self.assertIn("Supabase training_daily_summary_v3", workflow)

    def test_archive_contract_preserves_requested_window_and_source_gap(self) -> None:
        source = (ROOT / "training/backfill_training_archive.py").read_text(encoding="utf-8")
        self.assertIn("DEFAULT_START = date(2022, 8, 1)", source)
        self.assertIn("DEFAULT_END = date(2025, 7, 18)", source)
        self.assertIn("FIRST_USABLE_CAMS_DATE = date(2022, 8, 5)", source)
        self.assertIn('LINEAGE_VERSION = "training-archive-db-v1"', source)
        self.assertIn('NOTEBOOK_VERSION = "5.6.4"', source)
        self.assertIn('PROVINCE_IDS = tuple(f"TH-{code}" for code in range(30, 50))', source)
        from datetime import date
        requested_days = (date(2025, 7, 18) - date(2022, 8, 1)).days + 1
        usable_days = (date(2025, 7, 18) - date(2022, 8, 5)).days + 1
        self.assertEqual(requested_days, 1083)
        self.assertEqual(usable_days, 1079)
        self.assertEqual(usable_days * 20, 21580)

    def test_db_loader_uses_v3_and_no_network_urls(self) -> None:
        source = (ROOT / "training/db_training_data.py").read_text(encoding="utf-8")
        self.assertEqual(assigned_string(source, "TRAINING_VIEW"), "training_daily_summary_v3")
        self.assertEqual(assigned_string(source, "ARCHIVE_LINEAGE_VERSION"), "training-archive-db-v1")
        self.assertNotIn("open-meteo.com", source)
        self.assertIn('ARCHIVE_REQUEST_START_DATE = pd.Timestamp("2022-08-01")', source)
        self.assertIn('ARCHIVE_START_DATE = pd.Timestamp("2022-08-05")', source)

    def test_fire_features_are_next_schema_not_active_schema(self) -> None:
        config = (ROOT / "training/dual_model_config.py").read_text(encoding="utf-8")
        self.assertIn('POOLED_FEATURE_VERSION = "daily-pooled-v1"', config)
        self.assertIn('POOLED_FEATURE_VERSION_NEXT = "daily-pooled-v2-fire"', config)
        self.assertIn('"hotspot_count"', config)
        self.assertIn('"total_frp"', config)
        self.assertIn("missing historical coverage must never be silently interpreted as zero", config)


if __name__ == "__main__":
    unittest.main()
