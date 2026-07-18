#!/usr/bin/env python3
"""Train and validate PM2.5 next-day models without synthetic-data leakage.

The job performs rolling-origin teacher selection, holds back a final untouched
test period, distils the selected tree model into a production-safe standardized
Ridge surrogate, and optionally registers it as an inactive candidate.

Required environment variables:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Examples:
  python training_data.py
  python training_data.py --register
  python training_data.py --register --activate
"""

from __future__ import annotations

import argparse
import importlib.metadata
import json
import os
import subprocess
import sys
import traceback
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

import lightgbm as lgb
import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import TimeSeriesSplit
from sklearn.preprocessing import StandardScaler
from supabase import Client, create_client

OBSERVED_VIEW = "training_daily_summary_v2"
MODEL_NAME = "stacking-v2"
PAGE_SIZE = 1_000
MIN_TRUSTED_HOURS = 18
DEFAULT_MIN_ROWS = 180
MIN_FINAL_ROWS = 30
MIN_SKILL = 0.05
RANDOM_STATE = 42

FEATURE_COLS = [
    "pm25_mean",
    "pm25_lag_1d",
    "pm25_lag_3d",
    "pm25_lag_7d",
    "pm25_roll7",
    "neighbor_pm25_avg",
    "regional_pm25_avg",
    "temp_mean",
    "humidity_mean",
    "wind_speed_mean",
    "precip_total",
    "hotspot_count",
    "total_frp",
    "month",
    "day_of_week",
    "is_burning_season",
    "is_dry_season",
]

SELECT_COLS = [
    "province_id",
    "date",
    "trusted_hours",
    "trusted_sources",
    *FEATURE_COLS,
]

PROVINCE_IDS = [
    "TH-30", "TH-31", "TH-32", "TH-33", "TH-34",
    "TH-35", "TH-36", "TH-37", "TH-38", "TH-39",
    "TH-40", "TH-41", "TH-42", "TH-43", "TH-44",
    "TH-45", "TH-46", "TH-47", "TH-48", "TH-49",
]


@dataclass
class TrainingResult:
    province_id: str
    registry_row: dict
    manifest: dict
    teacher: object
    eligible_for_activation: bool


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--register", action="store_true", help="upsert inactive candidates to model_registry")
    parser.add_argument("--activate", action="store_true", help="activate eligible candidates transactionally")
    parser.add_argument("--min-rows", type=int, default=DEFAULT_MIN_ROWS)
    parser.add_argument("--cv-splits", type=int, default=3)
    parser.add_argument("--output-dir", type=Path, default=Path("training/artifacts"))
    parser.add_argument(
        "--allowed-source",
        action="append",
        default=None,
        help="trusted source to include; repeat for multiple sources (default: TRAINING_ALLOWED_SOURCES or open-meteo)",
    )
    args = parser.parse_args()
    if args.activate and not args.register:
        parser.error("--activate requires --register")
    if args.min_rows < 100:
        parser.error("--min-rows must be at least 100")
    if not 2 <= args.cv_splits <= 5:
        parser.error("--cv-splits must be between 2 and 5")
    return args


def get_client() -> Client:
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
    return create_client(url, key)


def fetch_observed_rows(sb: Client) -> pd.DataFrame:
    """Fetch every row deterministically; never rely on the Data API default cap."""
    rows: list[dict] = []
    start = 0
    while True:
        response = (
            sb.table(OBSERVED_VIEW)
            .select(",".join(SELECT_COLS))
            .in_("province_id", PROVINCE_IDS)
            .order("province_id")
            .order("date")
            .range(start, start + PAGE_SIZE - 1)
            .execute()
        )
        page = response.data or []
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            break
        start += PAGE_SIZE

    if not rows:
        raise RuntimeError(f"{OBSERVED_VIEW} returned no quality-gated rows; apply the v2 migration first")

    frame = pd.DataFrame(rows)
    frame["date"] = pd.to_datetime(frame["date"], errors="raise")
    for column in FEATURE_COLS + ["trusted_hours"]:
        frame[column] = pd.to_numeric(frame[column], errors="coerce")
    for column in ("is_burning_season", "is_dry_season"):
        frame[column] = frame[column].astype("Int64")
    return frame


def filter_allowed_sources(frame: pd.DataFrame, allowed: set[str]) -> pd.DataFrame:
    def accepted(value: object) -> bool:
        sources = value if isinstance(value, list) else []
        return bool({str(source).lower() for source in sources} & allowed)

    result = frame[
        (frame["trusted_hours"] >= MIN_TRUSTED_HOURS)
        & frame["trusted_sources"].map(accepted)
    ].copy()
    return result


def prepare_xy(frame: pd.DataFrame) -> tuple[np.ndarray, np.ndarray, pd.DataFrame]:
    """Create a strictly consecutive t -> t+1 target using observed rows only."""
    clean = frame.sort_values("date").drop_duplicates("date", keep="last").copy()
    clean["target"] = clean["pm25_mean"].shift(-1)
    clean["target_date"] = clean["date"].shift(-1)
    clean = clean[clean["target_date"] == clean["date"] + pd.Timedelta(days=1)]
    clean = clean.dropna(subset=FEATURE_COLS + ["target"])
    return (
        clean[FEATURE_COLS].to_numpy(dtype=float),
        clean["target"].to_numpy(dtype=float),
        clean,
    )


def model_factories() -> dict[str, tuple[Callable[[], object], dict]]:
    xgb_params = {
        "n_estimators": 300,
        "max_depth": 4,
        "learning_rate": 0.04,
        "subsample": 0.8,
        "colsample_bytree": 0.8,
        "min_child_weight": 5,
        "reg_alpha": 0.1,
        "reg_lambda": 1.0,
        "objective": "reg:squarederror",
        "random_state": RANDOM_STATE,
        "n_jobs": -1,
        "verbosity": 0,
    }
    lgb_params = {
        "n_estimators": 300,
        "max_depth": 4,
        "learning_rate": 0.04,
        "subsample": 0.8,
        "colsample_bytree": 0.8,
        "min_child_samples": 10,
        "reg_alpha": 0.1,
        "reg_lambda": 1.0,
        "random_state": RANDOM_STATE,
        "n_jobs": -1,
        "verbose": -1,
    }
    return {
        "xgboost": (lambda: xgb.XGBRegressor(**xgb_params), xgb_params),
        "lightgbm": (lambda: lgb.LGBMRegressor(**lgb_params), lgb_params),
    }


def regression_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
    return {
        "mae": float(mean_absolute_error(y_true, y_pred)),
        "rmse": float(np.sqrt(mean_squared_error(y_true, y_pred))),
        "r2": float(r2_score(y_true, y_pred)),
    }


def rolling_cv(
    X: np.ndarray,
    y: np.ndarray,
    factory: Callable[[], object],
    splits: int,
) -> tuple[dict, np.ndarray]:
    splitter = TimeSeriesSplit(n_splits=splits)
    fold_metrics: list[dict] = []
    oof = np.full(len(y), np.nan, dtype=float)
    for fold, (train_idx, validation_idx) in enumerate(splitter.split(X), start=1):
        model = factory()
        model.fit(X[train_idx], y[train_idx])
        prediction = model.predict(X[validation_idx])
        oof[validation_idx] = prediction
        fold_metrics.append({"fold": fold, **regression_metrics(y[validation_idx], prediction)})
    return {
        "folds": fold_metrics,
        "mae_mean": float(np.mean([item["mae"] for item in fold_metrics])),
        "mae_std": float(np.std([item["mae"] for item in fold_metrics])),
    }, oof


def library_versions() -> dict[str, str]:
    names = ["numpy", "pandas", "scikit-learn", "xgboost", "lightgbm", "supabase"]
    versions = {}
    for name in names:
        try:
            versions[name] = importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError:
            versions[name] = "unknown"
    return versions


def git_sha() -> str | None:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"], text=True, stderr=subprocess.DEVNULL
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        return None


def train_province(
    province_id: str,
    frame: pd.DataFrame,
    run_id: str,
    min_rows: int,
    cv_splits: int,
) -> TrainingResult | None:
    X, y, clean = prepare_xy(frame)
    if len(y) < min_rows:
        return None

    final_size = max(MIN_FINAL_ROWS, int(round(len(y) * 0.20)))
    if len(y) - final_size < 80:
        return None
    X_dev, X_final = X[:-final_size], X[-final_size:]
    y_dev, y_final = y[:-final_size], y[-final_size:]
    clean_dev, clean_final = clean.iloc[:-final_size], clean.iloc[-final_size:]

    factories = model_factories()
    cv_results = {}
    for name, (factory, _) in factories.items():
        cv_results[name], _ = rolling_cv(X_dev, y_dev, factory, cv_splits)
    teacher_name = min(cv_results, key=lambda name: cv_results[name]["mae_mean"])
    teacher_factory, teacher_params = factories[teacher_name]

    teacher = teacher_factory()
    teacher.fit(X_dev, y_dev)
    teacher_dev = teacher.predict(X_dev)
    teacher_final = teacher.predict(X_final)

    scaler = StandardScaler().fit(X_dev)
    X_dev_scaled = scaler.transform(X_dev)
    X_final_scaled = scaler.transform(X_final)
    surrogate = Ridge(alpha=1.0).fit(X_dev_scaled, teacher_dev)
    surrogate_dev = surrogate.predict(X_dev_scaled)
    surrogate_final = surrogate.predict(X_final_scaled)

    current_index = FEATURE_COLS.index("pm25_mean")
    persistence_dev = X_dev[:, current_index]
    persistence_final = X_final[:, current_index]
    stacker = Ridge(alpha=1.0, positive=True).fit(
        np.column_stack([persistence_dev, surrogate_dev]), y_dev
    )
    stack_final = stacker.predict(np.column_stack([persistence_final, surrogate_final]))

    baseline_metrics = regression_metrics(y_final, persistence_final)
    teacher_metrics = regression_metrics(y_final, teacher_final)
    surrogate_metrics = regression_metrics(y_final, surrogate_final)
    stack_metrics = regression_metrics(y_final, stack_final)
    skill = (
        1.0 - stack_metrics["mae"] / baseline_metrics["mae"]
        if baseline_metrics["mae"] > 0
        else 0.0
    )
    upper_errors = np.maximum(y_final - stack_final, 0.0)
    upper_q90 = float(np.quantile(upper_errors, 0.90))
    eligible = bool(
        len(y_final) >= MIN_FINAL_ROWS
        and skill >= MIN_SKILL
        and stack_metrics["mae"] < baseline_metrics["mae"]
    )

    artifact = {
        "artifact_schema": "standardized-ridge-v1",
        "feature_cols": FEATURE_COLS,
        "coefficients": surrogate.coef_.astype(float).tolist(),
        "intercept": float(surrogate.intercept_),
        "scaler_mean": scaler.mean_.astype(float).tolist(),
        "scaler_scale": scaler.scale_.astype(float).tolist(),
    }
    stacking = {
        "baseline": "persistence-current-day",
        "intercept": float(stacker.intercept_),
        "w_persist": float(stacker.coef_[0]),
        "w_surrogate": float(stacker.coef_[1]),
    }
    manifest = {
        "run_id": run_id,
        "province_id": province_id,
        "model_name": MODEL_NAME,
        "teacher_model": teacher_name,
        "teacher_params": teacher_params,
        "source_view": OBSERVED_VIEW,
        "trusted_sources": sorted({source for values in clean["trusted_sources"] for source in values}),
        "min_trusted_hours": MIN_TRUSTED_HOURS,
        "feature_schema_version": 2,
        "feature_cols": FEATURE_COLS,
        "data_start": clean["date"].min().date().isoformat(),
        "data_cutoff": clean["date"].max().date().isoformat(),
        "development_range": [
            clean_dev["date"].min().date().isoformat(),
            clean_dev["target_date"].max().date().isoformat(),
        ],
        "final_test_range": [
            clean_final["date"].min().date().isoformat(),
            clean_final["target_date"].max().date().isoformat(),
        ],
        "development_rows": int(len(y_dev)),
        "final_test_rows": int(len(y_final)),
        "cv": cv_results,
        "final_metrics": {
            "persistence": baseline_metrics,
            "teacher": teacher_metrics,
            "surrogate": surrogate_metrics,
            "stacking": stack_metrics,
            "skill_vs_persistence": float(skill),
        },
        "eligible_for_activation": eligible,
        "minimum_activation_skill": MIN_SKILL,
        "upper_residual_q90": upper_q90,
        "surrogate": artifact,
        "stacking": stacking,
        "git_sha": git_sha(),
        "python": sys.version.split()[0],
        "libraries": library_versions(),
        "trained_at": datetime.now(timezone.utc).isoformat(),
    }
    registry_row = {
        "model_name": MODEL_NAME,
        "province_id": province_id,
        "run_id": run_id,
        "trained_at": manifest["trained_at"],
        "training_rows": int(len(y_dev)),
        "mae": round(stack_metrics["mae"], 6),
        "rmse": round(stack_metrics["rmse"], 6),
        "r2": round(stack_metrics["r2"], 6),
        "is_active": False,
        "model_params": manifest,
    }
    return TrainingResult(province_id, registry_row, manifest, teacher, eligible)


def save_artifacts(result: TrainingResult, output_root: Path) -> None:
    target = output_root / result.manifest["run_id"] / result.province_id
    target.mkdir(parents=True, exist_ok=True)
    (target / "manifest.json").write_text(
        json.dumps(result.manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    if result.manifest["teacher_model"] == "xgboost":
        result.teacher.save_model(target / "teacher.xgb.json")
    else:
        result.teacher.booster_.save_model(str(target / "teacher.lgb.txt"))


def register_candidate(sb: Client, result: TrainingResult, activate: bool) -> None:
    sb.rpc("fn_upsert_model_registry", {"rows": [result.registry_row]}).execute()
    if activate and result.eligible_for_activation:
        sb.rpc("fn_activate_model", {
            "p_province_id": result.province_id,
            "p_model_name": MODEL_NAME,
            "p_run_id": result.manifest["run_id"],
        }).execute()


def main() -> int:
    args = parse_args()
    allowed = args.allowed_source or os.environ.get("TRAINING_ALLOWED_SOURCES", "open-meteo").split(",")
    allowed_sources = {source.strip().lower() for source in allowed if source.strip()}
    if not allowed_sources:
        raise RuntimeError("at least one allowed source is required")

    sb = get_client()
    raw = fetch_observed_rows(sb)
    frame = filter_allowed_sources(raw, allowed_sources)
    run_id = str(uuid.uuid4())
    results: list[TrainingResult] = []
    skipped: dict[str, int] = {}

    for province_id in PROVINCE_IDS:
        province_frame = frame[frame["province_id"] == province_id].copy()
        try:
            result = train_province(
                province_id,
                province_frame,
                run_id,
                args.min_rows,
                args.cv_splits,
            )
            if result is None:
                _, y, _ = prepare_xy(province_frame)
                skipped[province_id] = len(y)
                print(f"SKIP {province_id}: {len(y)} usable rows; need {args.min_rows}")
                continue
            save_artifacts(result, args.output_dir)
            if args.register:
                register_candidate(sb, result, args.activate)
            results.append(result)
            metrics = result.manifest["final_metrics"]
            print(
                f"OK {province_id}: MAE={metrics['stacking']['mae']:.3f} "
                f"baseline={metrics['persistence']['mae']:.3f} "
                f"skill={metrics['skill_vs_persistence']:+.3f} "
                f"eligible={result.eligible_for_activation}"
            )
        except Exception as exc:
            print(f"ERROR {province_id}: {exc}", file=sys.stderr)
            traceback.print_exc()

    summary = {
        "run_id": run_id,
        "trained": len(results),
        "eligible": sum(result.eligible_for_activation for result in results),
        "registered": len(results) if args.register else 0,
        "activated": sum(result.eligible_for_activation for result in results) if args.activate else 0,
        "skipped": skipped,
        "allowed_sources": sorted(allowed_sources),
        "auto_activation": False,
    }
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / f"run-{run_id}.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0 if results else 2


if __name__ == "__main__":
    raise SystemExit(main())
