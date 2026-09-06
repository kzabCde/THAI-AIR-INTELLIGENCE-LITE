#!/usr/bin/env python3
"""Persist the v5.6.4 historical Open-Meteo training archive in Supabase.

This is a one-time, idempotent migration utility for 2022-08-01 through
2025-07-18. It writes daily aggregates to training_daily_archive_v1 and writes
request-level lineage to training_archive_requests_v1. Monthly retraining must
not call Open-Meteo after this archive has been populated and verified.

Required environment variables:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import random
import time
import uuid
from datetime import date, datetime, timezone
from itertools import islice
from typing import Any, Iterable
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import numpy as np
import pandas as pd
from supabase import create_client

AIR_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
WEATHER_URL = "https://archive-api.open-meteo.com/v1/archive"
AIR_MODEL = "cams_global"
WEATHER_MODEL = "open-meteo-historical-weather"
LINEAGE_VERSION = "training-archive-db-v1"
NOTEBOOK_VERSION = "5.6.4"
SOURCE = "open-meteo"
TIMEZONE = "Asia/Bangkok"
DEFAULT_START = date(2022, 8, 1)
DEFAULT_END = date(2025, 7, 18)
PROVINCE_IDS = tuple(f"TH-{code}" for code in range(30, 50))
WEATHER_VARIABLES = (
    "temperature_2m_mean",
    "relative_humidity_2m_mean",
    "wind_speed_10m_mean",
    "surface_pressure_mean",
    "precipitation_sum",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start-date", type=date.fromisoformat, default=DEFAULT_START)
    parser.add_argument("--end-date", type=date.fromisoformat, default=DEFAULT_END)
    parser.add_argument("--chunk-days", type=int, default=365)
    parser.add_argument("--province-batch-size", type=int, default=5)
    parser.add_argument("--db-batch-size", type=int, default=500)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if args.start_date > args.end_date:
        parser.error("start date must not be after end date")
    if not 30 <= args.chunk_days <= 366:
        parser.error("chunk-days must be between 30 and 366")
    if not 1 <= args.province_batch_size <= 5:
        parser.error("province-batch-size must be between 1 and 5")
    if not 100 <= args.db_batch_size <= 1000:
        parser.error("db-batch-size must be between 100 and 1000")
    return args


def get_client():
    url = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
    return create_client(url, key)


def batches(values: Iterable[Any], size: int):
    iterator = iter(values)
    while True:
        batch = tuple(islice(iterator, size))
        if not batch:
            return
        yield batch


def date_chunks(start: date, end: date, days: int):
    current = pd.Timestamp(start)
    final = pd.Timestamp(end)
    while current <= final:
        chunk_end = min(final, current + pd.Timedelta(days=days - 1))
        yield current.date(), chunk_end.date()
        current = chunk_end + pd.Timedelta(days=1)


def canonical_sha256(payload: object) -> str:
    encoded = json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def fetch_json(url: str, params: dict[str, Any], attempts: int = 8) -> object:
    full_url = f"{url}?{urlencode(params)}"
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            request = Request(
                full_url,
                headers={"User-Agent": "thai-air-intelligence-training-archive/1.0"},
            )
            with urlopen(request, timeout=180) as response:
                payload = json.load(response)
            if isinstance(payload, dict) and payload.get("error"):
                raise RuntimeError(str(payload.get("reason") or payload))
            return payload
        except (HTTPError, URLError, TimeoutError, RuntimeError, ValueError) as exc:
            last_error = exc
            if attempt == attempts:
                break
            delay = min(300.0, 5.0 * (2 ** (attempt - 1)) + random.random())
            print(f"retry {attempt}/{attempts} in {delay:.1f}s: {exc}", flush=True)
            time.sleep(delay)
    raise RuntimeError(f"Open-Meteo request failed after {attempts} attempts: {last_error}")


def locations(payload: object, expected: int) -> list[dict[str, Any]]:
    result = payload if isinstance(payload, list) else [payload]
    if len(result) != expected or not all(isinstance(item, dict) for item in result):
        raise RuntimeError(f"Expected {expected} locations, received {len(result)}")
    return result


def load_provinces(sb) -> list[dict[str, Any]]:
    rows = (
        sb.table("isan_provinces")
        .select("province_id,name_en,lat,lon")
        .in_("province_id", list(PROVINCE_IDS))
        .order("province_id")
        .execute()
        .data
        or []
    )
    if len(rows) != 20:
        found = {str(row.get("province_id")) for row in rows}
        raise RuntimeError(f"Expected 20 provinces; missing {sorted(set(PROVINCE_IDS)-found)}")
    return rows


def hourly_air_daily(location: dict[str, Any], province_id: str) -> pd.DataFrame:
    hourly = location.get("hourly") or {}
    time_values = hourly.get("time") or []
    pm25_values = hourly.get("pm2_5") or []
    frame = pd.DataFrame(
        {
            "date": pd.to_datetime(time_values, errors="raise").normalize(),
            "pm25": pd.to_numeric(pm25_values, errors="coerce"),
        }
    )
    frame["province_id"] = province_id

    def percentile(values: pd.Series, q: float) -> float:
        clean = values.dropna().to_numpy(dtype=float)
        return float(np.quantile(clean, q)) if len(clean) else float("nan")

    daily = frame.groupby(["province_id", "date"], as_index=False).agg(
        pm25_mean=("pm25", "mean"),
        pm25_max=("pm25", "max"),
        pm25_min=("pm25", "min"),
        trusted_hours=("pm25", "count"),
    )
    q75 = frame.groupby(["province_id", "date"])["pm25"].apply(lambda s: percentile(s, 0.75))
    q90 = frame.groupby(["province_id", "date"])["pm25"].apply(lambda s: percentile(s, 0.90))
    daily = daily.merge(q75.rename("pm25_p75").reset_index(), on=["province_id", "date"])
    daily = daily.merge(q90.rename("pm25_p90").reset_index(), on=["province_id", "date"])
    return daily[daily["trusted_hours"] >= 18].copy()


def weather_daily(location: dict[str, Any], province_id: str) -> pd.DataFrame:
    daily = location.get("daily") or {}
    frame = pd.DataFrame({"date": pd.to_datetime(daily.get("time") or [], errors="raise").normalize()})
    mapping = {
        "temperature_2m_mean": "temp_mean",
        "relative_humidity_2m_mean": "humidity_mean",
        "wind_speed_10m_mean": "wind_speed_mean",
        "surface_pressure_mean": "pressure_mean",
        "precipitation_sum": "precip_total",
    }
    for source_column, target_column in mapping.items():
        frame[target_column] = pd.to_numeric(daily.get(source_column) or [], errors="coerce")
    frame["province_id"] = province_id
    return frame[["province_id", "date", *mapping.values()]]


def insert_request_lineage(
    sb,
    *,
    source_kind: str,
    endpoint: str,
    api_model: str,
    start: date,
    end: date,
    province_ids: list[str],
    params: dict[str, Any],
    payload: object,
    dry_run: bool,
) -> str:
    request_id = str(uuid.uuid4())
    fetched_at = datetime.now(timezone.utc).isoformat()
    row = {
        "request_id": request_id,
        "source_kind": source_kind,
        "endpoint": endpoint,
        "api_model": api_model,
        "requested_start_date": start.isoformat(),
        "requested_end_date": end.isoformat(),
        "province_ids": province_ids,
        "request_params": params,
        "response_sha256": canonical_sha256(payload),
        "response_metadata": {
            "location_count": len(payload) if isinstance(payload, list) else 1,
            "transport": "https",
            "source": SOURCE,
        },
        "fetched_at": fetched_at,
        "notebook_version": NOTEBOOK_VERSION,
        "lineage_version": LINEAGE_VERSION,
    }
    if not dry_run:
        sb.table("training_archive_requests_v1").insert(row).execute()
    return request_id


def upsert_archive_rows(sb, rows: list[dict[str, Any]], batch_size: int, dry_run: bool) -> None:
    if dry_run:
        return
    for chunk in batches(rows, batch_size):
        (
            sb.table("training_daily_archive_v1")
            .upsert(list(chunk), on_conflict="province_id,date")
            .execute()
        )


def verify_coverage(sb, start: date, end: date) -> dict[str, Any]:
    expected_days = (end - start).days + 1
    rows = (
        sb.table("training_daily_archive_v1")
        .select("province_id,date,lineage_version,air_request_id,weather_request_id")
        .gte("date", start.isoformat())
        .lte("date", end.isoformat())
        .order("province_id")
        .order("date")
        .execute()
        .data
        or []
    )
    frame = pd.DataFrame(rows)
    if frame.empty:
        raise RuntimeError("training_daily_archive_v1 is empty after backfill")
    counts = frame.groupby("province_id")["date"].nunique().to_dict()
    incomplete = {pid: int(counts.get(pid, 0)) for pid in PROVINCE_IDS if counts.get(pid, 0) != expected_days}
    null_lineage = int(frame[["air_request_id", "weather_request_id", "lineage_version"]].isna().any(axis=1).sum())
    if incomplete or null_lineage:
        raise RuntimeError(f"archive verification failed: incomplete={incomplete}, null_lineage_rows={null_lineage}")
    return {
        "rows": int(len(frame)),
        "expected_rows": expected_days * len(PROVINCE_IDS),
        "days_per_province": expected_days,
        "provinces": int(frame["province_id"].nunique()),
        "min_date": str(frame["date"].min()),
        "max_date": str(frame["date"].max()),
        "lineage_version": LINEAGE_VERSION,
    }


def main() -> int:
    args = parse_args()
    sb = get_client()
    provinces = load_provinces(sb)
    total_rows = 0
    request_count = 0

    for chunk_start, chunk_end in date_chunks(args.start_date, args.end_date, args.chunk_days):
        for province_batch in batches(provinces, args.province_batch_size):
            province_ids = [str(row["province_id"]) for row in province_batch]
            common = {
                "latitude": ",".join(str(row["lat"]) for row in province_batch),
                "longitude": ",".join(str(row["lon"]) for row in province_batch),
                "timezone": TIMEZONE,
                "start_date": chunk_start.isoformat(),
                "end_date": chunk_end.isoformat(),
            }
            air_params = {**common, "hourly": "pm2_5", "domains": AIR_MODEL}
            weather_params = {**common, "daily": ",".join(WEATHER_VARIABLES)}

            air_payload = fetch_json(AIR_URL, air_params)
            weather_payload = fetch_json(WEATHER_URL, weather_params)
            air_request_id = insert_request_lineage(
                sb,
                source_kind="air_quality",
                endpoint=AIR_URL,
                api_model=AIR_MODEL,
                start=chunk_start,
                end=chunk_end,
                province_ids=province_ids,
                params=air_params,
                payload=air_payload,
                dry_run=args.dry_run,
            )
            weather_request_id = insert_request_lineage(
                sb,
                source_kind="weather",
                endpoint=WEATHER_URL,
                api_model=WEATHER_MODEL,
                start=chunk_start,
                end=chunk_end,
                province_ids=province_ids,
                params=weather_params,
                payload=weather_payload,
                dry_run=args.dry_run,
            )
            request_count += 2

            air_locations = locations(air_payload, len(province_batch))
            weather_locations = locations(weather_payload, len(province_batch))
            output_rows: list[dict[str, Any]] = []
            for index, province in enumerate(province_batch):
                province_id = str(province["province_id"])
                air = hourly_air_daily(air_locations[index], province_id)
                weather = weather_daily(weather_locations[index], province_id)
                merged = air.merge(weather, on=["province_id", "date"], how="inner")
                for record in merged.to_dict("records"):
                    output_rows.append(
                        {
                            "province_id": province_id,
                            "date": pd.Timestamp(record["date"]).date().isoformat(),
                            "pm25_mean": float(record["pm25_mean"]),
                            "pm25_max": float(record["pm25_max"]),
                            "pm25_min": float(record["pm25_min"]),
                            "pm25_p75": float(record["pm25_p75"]),
                            "pm25_p90": float(record["pm25_p90"]),
                            "pm10_mean": None,
                            "temp_mean": float(record["temp_mean"]),
                            "temp_max": None,
                            "temp_min": None,
                            "humidity_mean": float(record["humidity_mean"]),
                            "wind_speed_mean": float(record["wind_speed_mean"]),
                            "wind_speed_max": None,
                            "wind_dir_mean": None,
                            "pressure_mean": float(record["pressure_mean"]),
                            "precip_total": float(record["precip_total"]),
                            "cloud_cover_mean": None,
                            "trusted_hours": int(record["trusted_hours"]),
                            "trusted_sources": [SOURCE],
                            "air_request_id": air_request_id,
                            "weather_request_id": weather_request_id,
                            "air_source": SOURCE,
                            "weather_source": SOURCE,
                            "air_model": AIR_MODEL,
                            "weather_model": WEATHER_MODEL,
                            "timezone": TIMEZONE,
                            "lineage_version": LINEAGE_VERSION,
                            "fetched_at": datetime.now(timezone.utc).isoformat(),
                        }
                    )
            upsert_archive_rows(sb, output_rows, args.db_batch_size, args.dry_run)
            total_rows += len(output_rows)
            print(
                json.dumps(
                    {
                        "period": f"{chunk_start}..{chunk_end}",
                        "provinces": province_ids,
                        "rows": len(output_rows),
                        "requests_written": 0 if args.dry_run else 2,
                    },
                    ensure_ascii=False,
                ),
                flush=True,
            )
            time.sleep(15)

    summary: dict[str, Any] = {
        "dry_run": bool(args.dry_run),
        "start_date": args.start_date.isoformat(),
        "end_date": args.end_date.isoformat(),
        "rows_prepared": total_rows,
        "request_records_prepared": request_count,
        "lineage_version": LINEAGE_VERSION,
    }
    if not args.dry_run:
        summary["verification"] = verify_coverage(sb, args.start_date, args.end_date)
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
