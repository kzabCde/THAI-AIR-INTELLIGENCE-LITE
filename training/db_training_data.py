"""Database-only loading and leakage-safe rebuilding for pooled PM2.5 training."""

from __future__ import annotations

import time

import numpy as np
import pandas as pd

from training.dual_model_config import POOLED_MINIMUM_ORIGIN_DAYS, POOLED_PROVINCE_IDS

TRAINING_VIEW = "training_daily_summary_v3"
ARCHIVE_REQUEST_START_DATE = pd.Timestamp("2022-08-01")
ARCHIVE_START_DATE = pd.Timestamp("2022-08-05")
ARCHIVE_END_DATE = pd.Timestamp("2025-07-18")
CONTINUATION_START_DATE = ARCHIVE_END_DATE + pd.Timedelta(days=1)
ARCHIVE_LINEAGE_VERSION = "training-archive-db-v1"
ARCHIVE_DATA_ORIGIN = "supabase-open-meteo-cams-historical-weather-archive"
FETCH_WINDOW_DAYS = 365
FETCH_MAX_ATTEMPTS = 3
FETCH_RETRY_BASE_SECONDS = 2.0
RETRYABLE_DATABASE_ERROR_CODES = ("57014",)
BASE_COLUMNS = (
    "province_id",
    "date",
    "trusted_hours",
    "trusted_sources",
    "data_origin",
    "lineage_version",
    "air_request_id",
    "weather_request_id",
    "fetched_at",
    "pm25_mean",
    "temp_mean",
    "humidity_mean",
    "wind_speed_mean",
    "precip_total",
)


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
    for column in (
        "pm25_mean",
        "temp_mean",
        "humidity_mean",
        "wind_speed_mean",
        "precip_total",
    ):
        rebuilt[column] = pd.to_numeric(rebuilt[column], errors="coerce")
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
        neighbor_ids[province_id] = tuple(distance.drop(province_id).nsmallest(3).index)
    pivot = rebuilt.pivot(index="date", columns="province_id", values="pm25_mean")
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
    rebuilt["is_burning_season"] = rebuilt["month"].isin((1, 2, 3, 4)).astype(float)
    rebuilt["is_dry_season"] = rebuilt["month"].isin((11, 12, 1, 2, 3, 4)).astype(float)
    day_of_year = rebuilt["date"].dt.dayofyear.to_numpy(dtype=float)
    rebuilt["day_of_year_sin"] = np.sin(2.0 * np.pi * day_of_year / 365.25)
    rebuilt["day_of_year_cos"] = np.cos(2.0 * np.pi * day_of_year / 365.25)
    return rebuilt.drop(columns=[f"_pm25_lag_{days}d" for days in range(1, 8)])


def _bangkok_today() -> pd.Timestamp:
    return pd.Timestamp.now(tz="Asia/Bangkok").tz_localize(None).normalize()


def _date_windows(start: pd.Timestamp, end: pd.Timestamp):
    cursor = pd.Timestamp(start).normalize()
    final = pd.Timestamp(end).normalize()
    while cursor <= final:
        window_end = min(
            cursor + pd.Timedelta(days=FETCH_WINDOW_DAYS - 1),
            final,
        )
        yield cursor, window_end
        cursor = window_end + pd.Timedelta(days=1)


def _fetch_training_window(
    sb,
    province_id: str,
    start_date: pd.Timestamp,
    end_date: pd.Timestamp,
) -> list[dict]:
    """Read one bounded province/date window with retry on statement timeout.

    The v3 source is a union-style view. A single globally ordered request over
    all provinces can force PostgreSQL to sort/materialize the full view and hit
    the hosted statement timeout. Each request here is bounded to at most one
    province-year and requires no server-side ORDER BY; final ordering is done
    deterministically in pandas after all windows are fetched.
    """
    start_iso = start_date.date().isoformat()
    end_iso = end_date.date().isoformat()
    for attempt in range(1, FETCH_MAX_ATTEMPTS + 1):
        try:
            return (
                sb.table(TRAINING_VIEW)
                .select(",".join(BASE_COLUMNS))
                .eq("province_id", province_id)
                .gte("date", start_iso)
                .lte("date", end_iso)
                .execute()
                .data
                or []
            )
        except Exception as exc:
            retryable = any(code in str(exc) for code in RETRYABLE_DATABASE_ERROR_CODES)
            if not retryable or attempt >= FETCH_MAX_ATTEMPTS:
                raise
            delay = FETCH_RETRY_BASE_SECONDS * (2 ** (attempt - 1))
            print(
                f"[DB] {province_id} {start_iso}..{end_iso} statement timeout; "
                f"retry {attempt}/{FETCH_MAX_ATTEMPTS} in {delay:.0f}s",
                flush=True,
            )
            time.sleep(delay)
    raise AssertionError("unreachable database retry state")


def fetch_training_rows(
    sb,
    province_ids: tuple[str, ...] = tuple(POOLED_PROVINCE_IDS),
) -> pd.DataFrame:
    rows: list[dict] = []
    fetch_end = _bangkok_today()
    request_count = 0
    for province_id in province_ids:
        for window_start, window_end in _date_windows(ARCHIVE_START_DATE, fetch_end):
            page = _fetch_training_window(
                sb,
                province_id,
                window_start,
                window_end,
            )
            rows.extend(page)
            request_count += 1
        print(
            f"[DB] loaded {province_id} through {fetch_end.date().isoformat()}",
            flush=True,
        )

    if not rows:
        raise RuntimeError(f"{TRAINING_VIEW} returned no rows")
    frame = pd.DataFrame(rows)
    frame["date"] = pd.to_datetime(frame["date"], errors="raise").dt.normalize()
    frame["trusted_hours"] = pd.to_numeric(frame["trusted_hours"], errors="coerce")
    frame = frame.sort_values(["province_id", "date"]).reset_index(drop=True)
    duplicate_mask = frame.duplicated(["province_id", "date"], keep=False)
    if duplicate_mask.any():
        examples = (
            frame.loc[duplicate_mask, ["province_id", "date"]]
            .drop_duplicates()
            .head(10)
            .to_dict("records")
        )
        raise RuntimeError(
            f"{TRAINING_VIEW} returned duplicate province/date rows: {examples}"
        )
    frame.attrs["database_fetch_strategy"] = "province_date_windows"
    frame.attrs["database_fetch_window_days"] = FETCH_WINDOW_DAYS
    frame.attrs["database_fetch_requests"] = request_count
    return frame


def validate_db_training_contract(frame: pd.DataFrame) -> dict:
    province_ids = tuple(POOLED_PROVINCE_IDS)
    expected_archive_days = int((ARCHIVE_END_DATE - ARCHIVE_START_DATE).days + 1)
    expected_archive_rows = expected_archive_days * len(province_ids)
    archive = frame[
        (frame["date"] >= ARCHIVE_START_DATE)
        & (frame["date"] <= ARCHIVE_END_DATE)
    ].copy()
    if len(archive) != expected_archive_rows:
        raise RuntimeError(
            f"historical archive must contain exactly {expected_archive_rows} "
            f"source-available rows; found {len(archive)}"
        )
    expected_dates = set(pd.date_range(ARCHIVE_START_DATE, ARCHIVE_END_DATE, freq="D"))
    incomplete: dict[str, int] = {}
    for province_id in province_ids:
        province_dates = set(
            archive.loc[archive["province_id"] == province_id, "date"]
        )
        if province_dates != expected_dates:
            incomplete[province_id] = len(province_dates)
    if incomplete:
        raise RuntimeError(f"historical archive coverage incomplete: {incomplete}")
    leading = frame[
        (frame["date"] >= ARCHIVE_REQUEST_START_DATE)
        & (frame["date"] < ARCHIVE_START_DATE)
        & (frame["data_origin"] == ARCHIVE_DATA_ORIGIN)
    ]
    if not leading.empty:
        raise RuntimeError(
            "unexpected fabricated archive rows exist inside the documented leading "
            "CAMS source gap"
        )
    if not (archive["data_origin"] == ARCHIVE_DATA_ORIGIN).all():
        raise RuntimeError("historical archive data_origin contract mismatch")
    if not (archive["lineage_version"] == ARCHIVE_LINEAGE_VERSION).all():
        raise RuntimeError("historical archive lineage_version contract mismatch")
    if archive[["air_request_id", "weather_request_id", "fetched_at"]].isna().any(
        axis=None
    ):
        raise RuntimeError("historical archive contains rows without request lineage")
    if (archive["trusted_hours"] < 18).any():
        raise RuntimeError(
            "historical archive contains rows below the 18 trusted-hour minimum"
        )

    continuation = frame[frame["date"] >= CONTINUATION_START_DATE].copy()
    if continuation.empty:
        raise RuntimeError("trusted database continuation is empty")
    if continuation["data_origin"].eq(ARCHIVE_DATA_ORIGIN).any():
        raise RuntimeError("archive rows leaked into the trusted continuation interval")

    total_counts = frame.groupby("province_id")["date"].nunique().to_dict()
    insufficient = {
        pid: int(total_counts.get(pid, 0))
        for pid in province_ids
        if total_counts.get(pid, 0) < POOLED_MINIMUM_ORIGIN_DAYS
    }
    if insufficient:
        raise RuntimeError(f"multi-season training history is incomplete: {insufficient}")

    return {
        "source_of_truth": TRAINING_VIEW,
        "network_archive_reads": 0,
        "database_fetch_strategy": frame.attrs.get(
            "database_fetch_strategy", "unknown"
        ),
        "database_fetch_window_days": int(
            frame.attrs.get("database_fetch_window_days", FETCH_WINDOW_DAYS)
        ),
        "database_fetch_requests": int(frame.attrs.get("database_fetch_requests", 0)),
        "archive_requested_start_date": ARCHIVE_REQUEST_START_DATE.date().isoformat(),
        "archive_first_usable_source_date": ARCHIVE_START_DATE.date().isoformat(),
        "archive_documented_leading_source_gap_days": int(
            (ARCHIVE_START_DATE - ARCHIVE_REQUEST_START_DATE).days
        ),
        "archive_end_date": ARCHIVE_END_DATE.date().isoformat(),
        "archive_rows": int(len(archive)),
        "archive_days_per_province": expected_archive_days,
        "archive_lineage_version": ARCHIVE_LINEAGE_VERSION,
        "continuation_start_date": CONTINUATION_START_DATE.date().isoformat(),
        "continuation_end_date": pd.Timestamp(
            continuation["date"].max()
        ).date().isoformat(),
        "continuation_rows": int(len(continuation)),
        "usable_days_by_province": {
            str(key): int(value) for key, value in total_counts.items()
        },
    }


def prepare_db_training_data(sb, province_metadata: pd.DataFrame):
    raw = fetch_training_rows(sb)
    audit = validate_db_training_contract(raw)
    observed = rebuild_leakage_safe_daily_features(raw, province_metadata)
    return observed, audit
