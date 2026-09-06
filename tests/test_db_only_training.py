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

    def test_monthly_workflow_uses_canonical_v5_6_4_and_no_archive_cache(self) -> None:
        workflow = (ROOT / ".github/workflows/pm25-monthly-auto-retrain.yml").read_text(
            encoding="utf-8"
        )
        self.assertNotIn("actions/cache", workflow)
        self.assertNotIn("open-meteo-monthly", workflow)
        self.assertNotIn("archive-cache-dir", workflow)
        self.assertIn("Supabase training_daily_summary_v3", workflow)
        self.assertIn("training.train_models_pm25_v5_6_4", workflow)
        self.assertNotIn("python -u -m training.monthly_auto_retrain", workflow)

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
        self.assertEqual(
            assigned_string(source, "TRAINING_VIEW"), "training_daily_summary_v3"
        )
        self.assertEqual(
            assigned_string(source, "ARCHIVE_LINEAGE_VERSION"),
            "training-archive-db-v1",
        )
        self.assertNotIn("open-meteo.com", source)
        self.assertIn('ARCHIVE_REQUEST_START_DATE = pd.Timestamp("2022-08-01")', source)
        self.assertIn('ARCHIVE_START_DATE = pd.Timestamp("2022-08-05")', source)

    def test_db_loader_uses_bounded_province_date_windows(self) -> None:
        source = (ROOT / "training/db_training_data.py").read_text(encoding="utf-8")
        self.assertIn("FETCH_WINDOW_DAYS = 365", source)
        self.assertIn('.eq("province_id", province_id)', source)
        self.assertIn('.gte("date", start_iso)', source)
        self.assertIn('.lte("date", end_iso)', source)
        self.assertNotIn('.in_("province_id", list(province_ids))', source)
        self.assertNotIn('.order("province_id")', source)
        self.assertIn('RETRYABLE_DATABASE_ERROR_CODES = ("57014",)', source)
        self.assertIn('"database_fetch_strategy": "province_date_windows"', source)

    def test_fire_features_are_next_schema_not_active_schema(self) -> None:
        config = (ROOT / "training/dual_model_config.py").read_text(encoding="utf-8")
        self.assertIn('POOLED_FEATURE_VERSION = "daily-pooled-v1"', config)
        self.assertIn('POOLED_FEATURE_VERSION_NEXT = "daily-pooled-v2-fire"', config)
        self.assertIn('"hotspot_count"', config)
        self.assertIn('"total_frp"', config)
        self.assertIn(
            "missing historical coverage must never be silently interpreted as zero",
            config,
        )

    def test_v5_6_4_entrypoint_installs_guarded_tuning_before_monthly_main(self) -> None:
        source = (ROOT / "training/train_models_pm25_v5_6_4.py").read_text(
            encoding="utf-8"
        )
        self.assertIn("install_into_monthly_retrainer", source)
        self.assertIn("TUNING_REVISION", source)
        self.assertIn("install_into_monthly_retrainer()", source)
        self.assertLess(
            source.index("install_into_monthly_retrainer()"),
            source.index("return run_fresh_db_only_training()"),
        )
        self.assertIn('"selection_data": "training_and_validation_only"', source)
        self.assertIn(
            '"test_role": "evaluation_and_same_holdout_promotion_only"', source
        )

    def test_v5_6_4_tuning_guards_long_horizons_and_critical_classes(self) -> None:
        source = (ROOT / "training/v5_6_4_tuning.py").read_text(encoding="utf-8")
        self.assertNotIn("open-meteo.com", source)
        self.assertIn("REGRESSION_LONG_HORIZON_MEAN_TOLERANCE", source)
        self.assertIn("REGRESSION_PER_HORIZON_TOLERANCE", source)
        self.assertIn("for h in range(2, 8)", source)
        self.assertIn("CLASSIFICATION_MIN_MID_F1_GAIN", source)
        self.assertIn("for class_id in (4, 5)", source)
        self.assertIn("v5_6_4_regression_eligibility.csv", source)
        self.assertIn("v5_6_4_classification_focus.json", source)
        self.assertIn("v5_6_4_chart_data.json", source)

    def test_colab_builder_is_db_only_and_has_four_result_charts(self) -> None:
        source = (ROOT / "scripts/build_runtime_notebooks.py").read_text(
            encoding="utf-8"
        )
        self.assertIn("training.train_models_pm25_v5_6_4", source)
        self.assertIn("training_daily_summary_v3", source)
        for cell_id in (
            "regression_skill_chart",
            "horizon_chart",
            "class_metrics_chart",
            "confusion_matrix_chart",
        ):
            self.assertIn(cell_id, source)
        for stale in (
            "ARCHIVE_CACHE_DIRECTORY",
            "TRAINING_CHECKPOINT_COMPATIBILITY_SHA",
            "pm25_v5_6_3",
            "fetch_archive_daily",
        ):
            self.assertNotIn(stale, source)


if __name__ == "__main__":
    unittest.main()
