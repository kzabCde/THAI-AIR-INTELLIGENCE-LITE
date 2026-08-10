"""Read-only Open-Meteo archive extension for monthly PM2.5 retraining.

Historical CAMS PM2.5 and Open-Meteo weather are cached on the runner and are
never written to Supabase. Trusted database rows take precedence from the first
available database date onward.
"""
from __future__ import annotations

import gzip
import hashlib
import json
import math
import os
import random
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from itertools import islice
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import numpy as np
import pandas as pd

AIR_ARCHIVE_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
WEATHER_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
ARCHIVE_DAILY_WEATHER_VARIABLES = {
    "temperature_2m_mean": "temp_mean",
    "relative_humidity_2m_mean": "humidity_mean",
    "wind_speed_10m_mean": "wind_speed_mean",
    "surface_pressure_mean": "pressure_mean",
    "precipitation_sum": "precip_total",
}


def _batches(values, size):
    iterator = iter(values)
    while True:
        batch = tuple(islice(iterator, size))
        if not batch:
            return
        yield batch


def _date_chunks(start, end, days):
    current = pd.Timestamp(start).normalize()
    end = pd.Timestamp(end).normalize()
    while current <= end:
        chunk_end = min(end, current + pd.Timedelta(days=days - 1))
        yield current, chunk_end
        current = chunk_end + pd.Timedelta(days=1)


class ArchiveClient:
    def __init__(self, cache_directory: Path):
        self.cache_directory = Path(cache_directory)
        self.cache_directory.mkdir(parents=True, exist_ok=True)
        self.minimum_interval = float(
            os.environ.get("MONTHLY_ARCHIVE_REQUEST_MIN_INTERVAL_SECONDS", "15")
        )
        self.timeout = int(
            os.environ.get("MONTHLY_ARCHIVE_REQUEST_TIMEOUT_SECONDS", "180")
        )
        self.max_attempts = int(os.environ.get("MONTHLY_ARCHIVE_MAX_ATTEMPTS", "8"))
        self.max_backoff = float(
            os.environ.get("MONTHLY_ARCHIVE_MAX_BACKOFF_SECONDS", "300")
        )
        self._last_request_at = 0.0

    def _cache_file(self, url: str, params: dict) -> Path:
        identity = json.dumps(
            {
                "url": url,
                "params": sorted((str(k), str(v)) for k, v in params.items()),
            },
            separators=(",", ":"),
            sort_keys=True,
        )
        return self.cache_directory / (
            f"{hashlib.sha256(identity.encode()).hexdigest()}.json.gz"
        )

    @staticmethod
    def _retry_after(headers) -> float | None:
        value = (headers.get("Retry-After") or "").strip()
        if not value:
            return None
        try:
            return max(0.0, float(value))
        except ValueError:
            try:
                retry_at = parsedate_to_datetime(value)
                if retry_at.tzinfo is None:
                    retry_at = retry_at.replace(tzinfo=timezone.utc)
                return max(
                    0.0,
                    (retry_at - datetime.now(timezone.utc)).total_seconds(),
                )
            except (TypeError, ValueError, OverflowError):
                return None

    def get_json(self, url: str, params: dict) -> object:
        cache_file = self._cache_file(url, params)
        if cache_file.exists():
            try:
                with gzip.open(cache_file, "rt", encoding="utf-8") as handle:
                    return json.load(handle)
            except (OSError, ValueError, json.JSONDecodeError):
                cache_file.unlink(missing_ok=True)

        full_url = f"{url}?{urlencode(params)}"
        last_error: Exception | None = None
        for attempt in range(1, self.max_attempts + 1):
            elapsed = time.monotonic() - self._last_request_at
            if elapsed < self.minimum_interval:
                time.sleep(self.minimum_interval - elapsed)
            try:
                request = Request(
                    full_url,
                    headers={
                        "User-Agent": "thai-air-intelligence-monthly-retrain/1.0"
                    },
                )
                with urlopen(request, timeout=self.timeout) as response:
                    self._last_request_at = time.monotonic()
                    payload = json.load(response)
                if isinstance(payload, dict) and payload.get("error"):
                    raise RuntimeError(str(payload.get("reason") or payload))
                temporary = cache_file.with_suffix(cache_file.suffix + ".tmp")
                with gzip.open(temporary, "wt", encoding="utf-8") as handle:
                    json.dump(
                        payload,
                        handle,
                        ensure_ascii=False,
                        separators=(",", ":"),
                    )
                temporary.replace(cache_file)
                return payload
            except HTTPError as exc:
                self._last_request_at = time.monotonic()
                last_error = exc
                retry_after = self._retry_after(exc.headers)
                wait = (
                    retry_after
                    if retry_after is not None
                    else 5.0 * (2 ** (attempt - 1))
                )
            except (URLError, TimeoutError, RuntimeError, ValueError) as exc:
                last_error = exc
                wait = 5.0 * (2 ** (attempt - 1)) + random.random()
            if attempt < self.max_attempts:
                wait = min(self.max_backoff, max(5.0, wait))
                print(
                    f"[Archive] retry {attempt}/{self.max_attempts} "
                    f"in {wait:.0f}s: {last_error}",
                    flush=True,
                )
                time.sleep(wait)
        raise RuntimeError(
            f"Open-Meteo archive request failed after {self.max_attempts} "
            f"attempts: {last_error}"
        )


def _locations(payload: object, expected: int) -> list[dict]:
    locations = payload if isinstance(payload, list) else [payload]
    if len(locations) != expected or not all(
        isinstance(item, dict) for item in locations
    ):
        raise RuntimeError(
            f"Expected {expected} Open-Meteo locations, received {len(locations)}"
        )
    return locations


def _daily_air(location: dict, province_id: str) -> pd.DataFrame:
    hourly = location.get("hourly") or {}
    frame = pd.DataFrame(
        {
            "date": pd.to_datetime(
                hourly.get("time") or [], errors="raise"
            ).normalize(),
            "pm25": pd.to_numeric(
                hourly.get("pm2_5") or [], errors="coerce"
            ),
        }
    )
    frame["province_id"] = province_id
    return frame.groupby(["province_id", "date"], as_index=False).agg(
        pm25_mean=("pm25", "mean"),
        trusted_hours=("pm25", "count"),
    )


def _daily_weather(location: dict, province_id: str) -> pd.DataFrame:
    daily = location.get("daily") or {}
    frame = pd.DataFrame(
        {
            "date": pd.to_datetime(
                daily.get("time") or [], errors="raise"
            ).normalize()
        }
    )
    for api_column, feature_column in ARCHIVE_DAILY_WEATHER_VARIABLES.items():
        frame[feature_column] = pd.to_numeric(
            daily.get(api_column) or [], errors="coerce"
        )
    frame["province_id"] = province_id
    return frame[
        ["province_id", "date", *ARCHIVE_DAILY_WEATHER_VARIABLES.values()]
    ]


def fetch_archive_daily(
    province_metadata: pd.DataFrame,
    start,
    end,
    *,
    cache_directory: Path,
    chunk_days: int = 365,
    province_batch_size: int = 5,
) -> pd.DataFrame:
    client = ArchiveClient(cache_directory)
    rows: list[pd.DataFrame] = []
    metadata_rows = province_metadata.sort_values("province_id").to_dict("records")
    total_chunks = sum(1 for _ in _date_chunks(start, end, chunk_days))
    total_batches = math.ceil(len(metadata_rows) / province_batch_size)
    done = 0
    for chunk_start, chunk_end in _date_chunks(start, end, chunk_days):
        for province_batch in _batches(metadata_rows, province_batch_size):
            coordinate_params = {
                "latitude": ",".join(
                    str(row["lat"]) for row in province_batch
                ),
                "longitude": ",".join(
                    str(row["lon"]) for row in province_batch
                ),
                "timezone": "Asia/Bangkok",
                "start_date": chunk_start.date().isoformat(),
                "end_date": chunk_end.date().isoformat(),
            }
            air_payload = client.get_json(
                AIR_ARCHIVE_URL,
                {
                    **coordinate_params,
                    "hourly": "pm2_5",
                    "domains": "cams_global",
                },
            )
            weather_payload = client.get_json(
                WEATHER_ARCHIVE_URL,
                {
                    **coordinate_params,
                    "daily": ",".join(ARCHIVE_DAILY_WEATHER_VARIABLES),
                },
            )
            air_locations = _locations(air_payload, len(province_batch))
            weather_locations = _locations(
                weather_payload, len(province_batch)
            )
            for index, province in enumerate(province_batch):
                air = _daily_air(
                    air_locations[index], province["province_id"]
                )
                weather = _daily_weather(
                    weather_locations[index], province["province_id"]
                )
                rows.append(
                    air.merge(
                        weather,
                        on=["province_id", "date"],
                        how="inner",
                    )
                )
            done += 1
            print(
                f"[Archive] {done}/{total_chunks * total_batches} "
                f"{chunk_start.date()}..{chunk_end.date()}",
                flush=True,
            )
    if not rows:
        return pd.DataFrame()
    archive = pd.concat(rows, ignore_index=True)
    archive = archive[archive["trusted_hours"] >= 18].copy()
    archive["trusted_sources"] = [
        ["open-meteo"] for _ in range(len(archive))
    ]
    archive["data_origin"] = "open-meteo-cams-and-weather-archive"
    return archive


def _exact_lag(frame: pd.DataFrame, days: int) -> np.ndarray:
    result = np.full(len(frame), np.nan, dtype=float)
    for _, positions in frame.groupby("province_id", sort=False).groups.items():
        positions = list(positions)
        province = frame.loc[positions]
        lookup = province.set_index("date")["pm25_mean"]
        result[positions] = (
            province["date"] - pd.Timedelta(days=days)
        ).map(lookup).to_numpy(dtype=float)
    return result


def rebuild_leakage_safe_daily_features(
    frame: pd.DataFrame,
    province_metadata: pd.DataFrame,
) -> pd.DataFrame:
    rebuilt = (
        frame.sort_values(["province_id", "date"])
        .drop_duplicates(["province_id", "date"], keep="last")
        .reset_index(drop=True)
    )
    rebuilt["date"] = pd.to_datetime(rebuilt["date"]).dt.normalize()
    for days in range(1, 8):
        rebuilt[f"_pm25_lag_{days}d"] = _exact_lag(rebuilt, days)
    rebuilt["pm25_lag_1d"] = rebuilt["_pm25_lag_1d"]
    rebuilt["pm25_lag_3d"] = rebuilt["_pm25_lag_3d"]
    rebuilt["pm25_lag_6d"] = rebuilt["_pm25_lag_6d"]
    rebuilt["pm25_lag_7d"] = rebuilt["_pm25_lag_7d"]
    rebuilt["pm25_roll3"] = rebuilt[
        ["pm25_mean", "_pm25_lag_1d", "_pm25_lag_2d"]
    ].mean(axis=1, skipna=False)
    rebuilt["pm25_roll7"] = rebuilt[
        ["pm25_mean", *[f"_pm25_lag_{d}d" for d in range(1, 7)]]
    ].mean(axis=1, skipna=False)

    coordinates = province_metadata.set_index("province_id")[["lat", "lon"]]
    neighbor_ids: dict[str, tuple[str, ...]] = {}
    for province_id in coordinates.index:
        delta = coordinates - coordinates.loc[province_id]
        distance = np.square(delta["lat"]) + np.square(delta["lon"])
        neighbor_ids[province_id] = tuple(
            distance.drop(province_id).nsmallest(3).index
        )
    pivot = rebuilt.pivot(
        index="date",
        columns="province_id",
        values="pm25_mean",
    )
    regional_mean = pivot.mean(axis=1)
    neighbor_lookup = {
        province_id: pivot.reindex(columns=list(neighbors)).mean(axis=1)
        for province_id, neighbors in neighbor_ids.items()
    }
    rebuilt["regional_pm25_avg"] = rebuilt["date"].map(regional_mean)
    rebuilt["neighbor_pm25_avg"] = [
        neighbor_lookup[province_id].get(date, np.nan)
        for province_id, date in zip(
            rebuilt["province_id"], rebuilt["date"], strict=True
        )
    ]
    rebuilt["month"] = rebuilt["date"].dt.month.astype(int)
    rebuilt["day_of_week"] = rebuilt["date"].dt.dayofweek.astype(int)
    rebuilt["is_burning_season"] = rebuilt["month"].isin(
        (1, 2, 3, 4)
    ).astype(float)
    rebuilt["is_dry_season"] = rebuilt["month"].isin(
        (11, 12, 1, 2, 3, 4)
    ).astype(float)
    day_of_year = rebuilt["date"].dt.dayofyear.to_numpy(dtype=float)
    rebuilt["day_of_year_sin"] = np.sin(
        2.0 * np.pi * day_of_year / 365.25
    )
    rebuilt["day_of_year_cos"] = np.cos(
        2.0 * np.pi * day_of_year / 365.25
    )
    return rebuilt.drop(
        columns=[f"_pm25_lag_{days}d" for days in range(1, 8)]
    )
