import argparse
import unittest
from datetime import date

from training import backfill_open_meteo as backfill


class BackfillOpenMeteoTest(unittest.TestCase):
    def test_date_range_is_inclusive(self):
        args = argparse.Namespace(
            days=365,
            start_date=date(2025, 7, 18),
            end_date=date(2026, 7, 17),
        )

        start, end = backfill.date_range(args)

        self.assertEqual(start, date(2025, 7, 18))
        self.assertEqual(end, date(2026, 7, 17))
        self.assertEqual((end - start).days + 1, 365)

    def test_hourly_rows_convert_timestamp_and_integer_aqi(self):
        payload = {
            "hourly": {
                "time": ["2026-01-01T00:00", "2026-01-01T01:00"],
                "pm2_5": [12.5, 13.0],
                "us_aqi": [42.6, None],
            }
        }

        rows = backfill.hourly_rows(
            payload,
            "TH-30",
            {"pm2_5": "pm25", "us_aqi": "aqi"},
            integer_columns=frozenset({"aqi"}),
        )

        self.assertEqual(rows[0]["observed_at"], "2026-01-01T00:00:00Z")
        self.assertEqual(rows[0]["aqi"], 43)
        self.assertIsNone(rows[1]["aqi"])
        self.assertEqual(rows[0]["source"], "open-meteo")

    def test_validation_rejects_incomplete_response(self):
        with self.assertRaisesRegex(RuntimeError, "expected 24"):
            backfill.validate_hourly_rows(
                [{"temperature": 28.0}],
                "TH-30",
                date(2026, 1, 1),
                date(2026, 1, 1),
                "temperature",
            )


if __name__ == "__main__":
    unittest.main()
