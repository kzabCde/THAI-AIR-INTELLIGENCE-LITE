#!/usr/bin/env python3
"""Backfill 365 days of Open-Meteo/CAMS air quality and weather data.

The script is idempotent. It upserts hourly rows using the existing
(province_id, observed_at, source) keys, rebuilds daily_summary in chronological
order, and verifies that training_daily_summary_v2 has enough rows.

Required environment variables:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Open-Meteo air-quality values are CAMS model-derived data, not station
observations. Keep that provenance clear in research and user-facing copy.
"""

from __future__ import annotations

import argparse
import json
import os
import random
import sys
import time
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from typing import TYPE_CHECKING, Any, Iterable
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

if TYPE_CHECKING:
    from supabase import Client
else:
    Client = Any


AIR_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
WEATHER_URL = "https://archive-api.open-meteo.com/v1/archive"
SOURCE = "open-meteo"
PROVINCE_IDS = [f"TH-{number}" for number in range(30, 50)]
AIR_HOURLY = ("pm2_5", "pm10", "us_aqi")
WEATHER_HOURLY = (
    "temperature_2m",
    "relative_humidity_2m",
    "wind_speed_10m",
    "wind_direction_10m",
    "surface_pressure",
    "precipitation",
    "cloud_cover",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--days", type=int, default=365)
    parser.add_argument("--start-date", type=date.fromisoformat)
    parser.add_argument("--end-date", type=date.fromisoformat)
    parser.add_argument("--batch-size", type=int, default=500)
    parser.add_argument("--minimum-training-rows", type=int, default=180)
    parser.add_argument("--skip-air", action="store_true")
    parser.add_argument("--skip-weather", action="store_true")
    parser.add_argument("--skip-rebuild", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if args.days < 30:
        parser.error("--days must be at least 30")
    if not 100 <= args.batch_size <= 1_000:
        parser.error("--batch-size must be between 100 and 1000")
    if args.minimum_training_rows < 100:
        parser.error("--minimum-training-rows must be at least 100")
    if args.start_date and not args.end_date:
        parser.error("--start-date requires --end-date")
    return args


def date_range(args: argparse.Namespace) -> tuple[date, date]:
    end = args.end_date or (datetime.now(ZoneInfo("Asia/Bangkok")).date() - timedelta(days=1))
    start = args.start_date or (end - timedelta(days=args.days - 1))
    if start > end:
        raise ValueError("start date must not be after end date")
    return start, end


def get_client() -> Client:
    try:
        from supabase import create_client
    except ImportError as exc:
        raise RuntimeError(
            "Missing dependency: install training/requirements.txt before running"
        ) from exc
    url = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
    if key.lower().startswith(("sb_publishable_", "sb_anon_")):
        raise RuntimeError("A server-side sb_secret_ or legacy service_role key is required")
    return create_client(url, key)


def fetch_json(url: str, params: dict[str, Any], attempts: int = 5) -> dict[str, Any]:
    full_url = f"{url}?{urlencode(params)}"
    for attempt in range(1, attempts + 1):
        try:
            request = Request(full_url, headers={"User-Agent": "thai-air-intelligence-backfill/1.0"})
            with urlopen(request, timeout=90) as response:
                payload = json.load(response)
            if isinstance(payload, dict) and payload.get("error"):
                raise RuntimeError(str(payload.get("reason") or payload))
            if not isinstance(payload, dict):
                raise RuntimeError("Open-Meteo returned an unexpected response")
            return payload
        except (HTTPError, URLError, TimeoutError, RuntimeError) as exc:
            if attempt == attempts:
                raise RuntimeError(f"Open-Meteo request failed after {attempts} attempts: {exc}") from exc
            delay = min(30.0, (2 ** (attempt - 1)) + random.random())
            print(f"  retry {attempt}/{attempts} in {delay:.1f}s: {exc}", file=sys.stderr)
            time.sleep(delay)
    raise AssertionError("unreachable")


def chunks(rows: list[dict[str, Any]], size: int) -> Iterable[list[dict[str, Any]]]:
    for start in range(0, len(rows), size):
        yield rows[start : start + size]


def number(values: list[Any], index: int) -> float | int | None:
    if index >= len(values):
        return None
    value = values[index]
    return value if isinstance(value, (int, float)) else None


def iso_utc(value: str) -> str:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def hourly_rows(
    payload: dict[str, Any],
    province_id: str,
    mapping: dict[str, str],
    integer_columns: frozenset[str] = frozenset(),
) -> list[dict[str, Any]]:
    hourly = payload.get("hourly")
    if not isinstance(hourly, dict) or not isinstance(hourly.get("time"), list):
        raise RuntimeError(f"{province_id}: Open-Meteo response has no hourly data")
    times = hourly["time"]
    arrays = {source: hourly.get(source) or [] for source in mapping}
    rows: list[dict[str, Any]] = []
    for index, observed_at in enumerate(times):
        row: dict[str, Any] = {
            "province_id": province_id,
            "observed_at": iso_utc(str(observed_at)),
            "source": SOURCE,
        }
        for source_name, column_name in mapping.items():
            value = number(arrays[source_name], index)
            row[column_name] = (
                int(round(value))
                if value is not None and column_name in integer_columns
                else value
            )
        rows.append(row)
    return rows


def validate_hourly_rows(
    rows: list[dict[str, Any]],
    province_id: str,
    start: date,
    end: date,
    required_column: str,
) -> None:
    expected = ((end - start).days + 1) * 24
    if len(rows) != expected:
        raise RuntimeError(
            f"{province_id}: expected {expected} hourly rows but received {len(rows)}"
        )
    available = sum(row.get(required_column) is not None for row in rows)
    if available < expected * 0.75:
        raise RuntimeError(
            f"{province_id}: only {available}/{expected} rows contain {required_column}"
        )


def load_provinces(sb: Client) -> list[dict[str, Any]]:
    response = (
        sb.table("isan_provinces")
        .select("province_id,name_en,lat,lon")
        .in_("province_id", PROVINCE_IDS)
        .order("province_id")
        .execute()
    )
    provinces = response.data or []
    if len(provinces) != 20:
        found = {row.get("province_id") for row in provinces}
        missing = sorted(set(PROVINCE_IDS) - found)
        raise RuntimeError(f"Expected 20 Isan provinces; missing: {missing}")
    return provinces


def fetch_air(province: dict[str, Any], start: date, end: date) -> list[dict[str, Any]]:
    payload = fetch_json(
        AIR_URL,
        {
            "latitude": province["lat"],
            "longitude": province["lon"],
            "hourly": ",".join(AIR_HOURLY),
            "domains": "cams_global",
            "timezone": "UTC",
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
        },
    )
    rows = hourly_rows(
        payload,
        province["province_id"],
        {"pm2_5": "pm25", "pm10": "pm10", "us_aqi": "aqi"},
        integer_columns=frozenset({"aqi"}),
    )
    validate_hourly_rows(rows, province["province_id"], start, end, "pm25")
    return rows


def fetch_weather(province: dict[str, Any], start: date, end: date) -> list[dict[str, Any]]:
    payload = fetch_json(
        WEATHER_URL,
        {
            "latitude": province["lat"],
            "longitude": province["lon"],
            "hourly": ",".join(WEATHER_HOURLY),
            "timezone": "UTC",
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
        },
    )
    rows = hourly_rows(
        payload,
        province["province_id"],
        {
            "temperature_2m": "temperature",
            "relative_humidity_2m": "humidity",
            "wind_speed_10m": "wind_speed",
            "wind_direction_10m": "wind_direction",
            "surface_pressure": "pressure",
            "precipitation": "precipitation",
            "cloud_cover": "cloud_cover",
        },
    )
    validate_hourly_rows(rows, province["province_id"], start, end, "temperature")
    return rows


def upsert_rows(
    sb: Client,
    table: str,
    rows: list[dict[str, Any]],
    batch_size: int,
    dry_run: bool,
) -> int:
    if dry_run:
        return len(rows)
    saved = 0
    for batch in chunks(rows, batch_size):
        (
            sb.table(table)
            .upsert(batch, on_conflict="province_id,observed_at,source")
            .execute()
        )
        saved += len(batch)
    return saved


def rebuild_daily_summary(sb: Client, start: date, end: date, dry_run: bool) -> int:
    total = (end - start).days + 1
    if dry_run:
        return total
    rebuilt = 0
    current = start
    while current <= end:
        for attempt in range(1, 4):
            try:
                sb.rpc("fn_build_daily_summary", {"p_date": current.isoformat()}).execute()
                break
            except Exception:
                if attempt == 3:
                    raise
                time.sleep(2 ** attempt)
        rebuilt += 1
        if rebuilt % 25 == 0 or rebuilt == total:
            print(f"daily_summary: {rebuilt}/{total} days")
        current += timedelta(days=1)
    return rebuilt


def training_counts(sb: Client) -> Counter[str]:
    counts: Counter[str] = Counter()
    start = 0
    page_size = 1_000
    while True:
        page = (
            sb.table("training_daily_summary_v2")
            .select("province_id,date")
            .order("province_id")
            .order("date")
            .range(start, start + page_size - 1)
            .execute()
            .data
            or []
        )
        counts.update(str(row["province_id"]) for row in page)
        if len(page) < page_size:
            break
        start += page_size
    return counts


def main() -> int:
    args = parse_args()
    start, end = date_range(args)
    sb = get_client()
    provinces = load_provinces(sb)
    print(
        json.dumps(
            {
                "start_date": start.isoformat(),
                "end_date": end.isoformat(),
                "days": (end - start).days + 1,
                "provinces": len(provinces),
                "dry_run": args.dry_run,
                "source": SOURCE,
            },
            ensure_ascii=False,
        )
    )

    air_saved = 0
    weather_saved = 0
    for number_done, province in enumerate(provinces, start=1):
        label = f"{province['province_id']} {province.get('name_en') or ''}".strip()
        print(f"[{number_done}/20] {label}")
        if not args.skip_air:
            rows = fetch_air(province, start, end)
            air_saved += upsert_rows(sb, "air_quality_hourly", rows, args.batch_size, args.dry_run)
            print(f"  air: {len(rows)} hourly rows")
        if not args.skip_weather:
            rows = fetch_weather(province, start, end)
            weather_saved += upsert_rows(sb, "weather_hourly", rows, args.batch_size, args.dry_run)
            print(f"  weather: {len(rows)} hourly rows")

    rebuilt = 0
    if not args.skip_rebuild:
        rebuilt = rebuild_daily_summary(sb, start, end, args.dry_run)

    summary: dict[str, Any] = {
        "air_rows": air_saved,
        "weather_rows": weather_saved,
        "daily_summary_days": rebuilt,
    }
    exit_code = 0
    if not args.dry_run:
        counts = training_counts(sb)
        summary["training_rows_by_province"] = dict(sorted(counts.items()))
        insufficient = {
            province_id: counts.get(province_id, 0)
            for province_id in PROVINCE_IDS
            if counts.get(province_id, 0) < args.minimum_training_rows
        }
        summary["insufficient_provinces"] = insufficient
        if insufficient:
            exit_code = 2
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
