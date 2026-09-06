from __future__ import annotations

import importlib.util
import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]


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

    def test_archive_contract_has_expected_fixed_window(self) -> None:
        spec = importlib.util.spec_from_file_location(
            "db_training_data", ROOT / "training/db_training_data.py"
        )
        self.assertIsNotNone(spec)
        module = importlib.util.module_from_spec(spec)
        assert spec and spec.loader
        spec.loader.exec_module(module)
        days = int((module.ARCHIVE_END_DATE - module.ARCHIVE_START_DATE).days + 1)
        self.assertEqual(days, 1083)
        self.assertEqual(days * len(module.POOLED_PROVINCE_IDS), 21660)
        self.assertEqual(module.TRAINING_VIEW, "training_daily_summary_v3")
        self.assertEqual(module.ARCHIVE_LINEAGE_VERSION, "training-archive-db-v1")

    def test_fire_features_are_next_schema_not_active_schema(self) -> None:
        config = (ROOT / "training/dual_model_config.py").read_text(encoding="utf-8")
        self.assertIn('POOLED_FEATURE_VERSION = "daily-pooled-v1"', config)
        self.assertIn('POOLED_FEATURE_VERSION_NEXT = "daily-pooled-v2-fire"', config)
        self.assertIn('"hotspot_count"', config)
        self.assertIn('"total_frp"', config)
        self.assertIn("missing historical coverage must never be silently interpreted as zero", config)


if __name__ == "__main__":
    unittest.main()
