"""Lightweight PM2.5 inference endpoint.

The v5 path evaluates the exact portable LightGBM/Random Forest tree artifacts
stored in the private model bucket.  Legacy Ridge/Logistic artifacts remain
readable as a rollback path.  Missing, corrupt, or schema-mismatched artifacts
fail closed to the explicit seven-day recent-observation mean baseline.
"""

from __future__ import annotations

import hmac
import hashlib
import json
import math
import os
import uuid
from datetime import date, datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler
from zoneinfo import ZoneInfo

import numpy as np
from supabase import Client, create_client

from api.ml.portable_trees import (
    ARTIFACT_SCHEMA as TREE_ARTIFACT_SCHEMA,
    decode_artifact,
    evaluate_lightgbm_regressor,
    evaluate_random_forest_classifier,
)

from training.dual_model_config import (
    FALLBACK_MODEL_NAME,
    FALLBACK_WINDOW_DAYS,
)

from training.pm25_classes import (
    CLASS_IDS,
    THRESHOLD_VERSION,
    class_definition,
    class_for_pm25,
    normalize_probabilities,
)

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
ML_SECRET = os.environ.get("ML_SECRET", "")

BANGKOK = ZoneInfo("Asia/Bangkok")
MAX_SOURCE_AGE_DAYS = 2
OBSERVED_VIEW = "training_daily_summary_v2"
STACKING_MODEL = "stacking-v2"
SURROGATE_MODEL = "surrogate-v2"
ENSEMBLE6_MODEL = "ensemble6-pm25-v3"
LEGACY_POOLED_LIGHTGBM_MODEL = "lightgbm-pm25-pooled-v1"
POOLED_LIGHTGBM_MODEL = "lightgbm-pm25-residual-v2"
POOLED_RF_CLASSIFIER = "random-forest-aqi-classifier-pooled-v1"
LEGACY_PERSIST_MODEL = "persist-revert-v2"
LEGACY_STACKING_MODEL = "stacking-v1"
LEGACY_BASE_MODELS = {"lightgbm-v1", "xgboost-v1"}
SERVING_POLICY = os.environ.get(
    "PM25_SERVING_POLICY",
    "classifier_with_regression_fallback",
)
SUPPORTED_SERVING_POLICIES = {
    "direct_classifier",
    "regression_threshold",
    "classifier_with_regression_fallback",
}

FEATURE_COLS = [
    "pm25_mean",
    "pm25_lag_1d",
    "pm25_lag_3d",
    "pm25_lag_6d",
    "pm25_lag_7d",
    "pm25_roll3",
    "pm25_roll7",
    "neighbor_pm25_avg",
    "regional_pm25_avg",
    "temp_mean",
    "humidity_mean",
    "wind_speed_mean",
    "precip_total",
    "month",
    "day_of_week",
    "day_of_year_sin",
    "day_of_year_cos",
    "is_burning_season",
    "is_dry_season",
]

PROVINCE_IDS = [
    "TH-30", "TH-31", "TH-32", "TH-33", "TH-34",
    "TH-35", "TH-36", "TH-37", "TH-38", "TH-39",
    "TH-40", "TH-41", "TH-42", "TH-43", "TH-44",
    "TH-45", "TH-46", "TH-47", "TH-48", "TH-49",
]


def _is_production() -> bool:
    return os.environ.get("NODE_ENV") == "production" or os.environ.get("VERCEL_ENV") == "production"


def _authorized(headers: dict) -> bool:
    if not ML_SECRET:
        return not _is_production()
    auth = headers.get("Authorization") or headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return False
    return hmac.compare_digest(auth.split(" ", 1)[1], ML_SECRET)


def _parse_horizon(body: dict) -> int:
    raw = body.get("horizon", 7)
    if isinstance(raw, bool):
        raise ValueError("horizon must be an integer between 1 and 14")
    try:
        horizon = int(raw)
    except (TypeError, ValueError) as exc:
        raise ValueError("horizon must be an integer between 1 and 14") from exc
    if not 1 <= horizon <= 14 or str(raw).strip() != str(horizon):
        raise ValueError("horizon must be an integer between 1 and 14")
    return horizon


def get_client() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def load_active_task_models(sb: Client) -> dict[str, dict[str, dict]]:
    """Load at most one active model per province and task."""
    resp = (
        sb.table("model_registry")
        .select(
            "province_id,task_type,model_name,model_params,run_id,"
            "mae,rmse,r2,metrics,baseline_metrics,eligibility_status,"
            "feature_version,runtime_artifact_uri,runtime_artifact_sha256,"
            "runtime_artifact_byte_size,runtime_artifact_format,"
            "threshold_version,serving_model_family,model_version,evidence_status"
        )
        .eq("is_active", True)
        .execute()
    )
    result: dict[str, dict[str, dict]] = {
        "regression": {},
        "classification": {},
    }
    for row in resp.data or []:
        province_id = row.get("province_id")
        if not province_id:
            continue
        task_type = row.get("task_type") or "regression"
        if task_type not in result:
            raise RuntimeError(f"unsupported active model task {task_type}")
        if province_id in result[task_type]:
            raise RuntimeError(
                f"multiple active models for {province_id} task {task_type}"
            )
        result[task_type][province_id] = row
    return result


def load_province_metadata(sb: Client) -> dict[str, dict[str, float]]:
    response = (
        sb.table("isan_provinces")
        .select("province_id,lat,lon")
        .in_("province_id", PROVINCE_IDS)
        .execute()
    )
    return {
        str(row["province_id"]): {
            "lat": float(row["lat"]),
            "lon": float(row["lon"]),
        }
        for row in response.data or []
        if row.get("province_id") and row.get("lat") is not None and row.get("lon") is not None
    }


def _storage_location(uri: str) -> tuple[str, str]:
    prefix = "storage://"
    if not uri.startswith(prefix):
        raise ValueError("runtime artifact must use a private storage URI")
    location = uri[len(prefix):]
    bucket, separator, path = location.partition("/")
    if not separator or not bucket or not path or ".." in path.split("/"):
        raise ValueError("invalid runtime artifact storage URI")
    return bucket, path


def load_runtime_artifact(
    sb: Client,
    model_row: dict | None,
    cache: dict[str, dict],
) -> dict | None:
    if not model_row:
        return None
    params = model_row.get("model_params") or {}
    uri = model_row.get("runtime_artifact_uri") or params.get("runtime_artifact_uri")
    expected_sha = (
        model_row.get("runtime_artifact_sha256")
        or params.get("runtime_artifact_sha256")
    )
    if not uri or not expected_sha:
        return None
    cache_key = f"{uri}#{expected_sha}"
    if cache_key in cache:
        return cache[cache_key]
    bucket, path = _storage_location(str(uri))
    payload = sb.storage.from_(bucket).download(path)
    expected_size = model_row.get("runtime_artifact_byte_size")
    if expected_size is not None and len(payload) != int(expected_size):
        raise ValueError("runtime artifact byte size mismatch")
    if hashlib.sha256(payload).hexdigest() != str(expected_sha):
        raise ValueError("runtime artifact checksum mismatch")
    if model_row.get("runtime_artifact_format") not in (None, "json+gzip"):
        raise ValueError("unsupported runtime artifact format")
    artifact = decode_artifact(payload)
    if artifact.get("feature_version") != (
        model_row.get("feature_version") or params.get("feature_version")
    ):
        raise ValueError("runtime artifact feature version mismatch")
    expected_task = model_row.get("task_type")
    if expected_task and artifact.get("task_type") != expected_task:
        raise ValueError("runtime artifact task mismatch")
    expected_family = (
        model_row.get("serving_model_family")
        or params.get("serving_model_family")
    )
    if expected_family and artifact.get("model_family") != expected_family:
        raise ValueError("runtime artifact model family mismatch")
    expected_features = params.get("feature_cols")
    if expected_features and artifact.get("feature_cols") != expected_features:
        raise ValueError("runtime artifact feature order mismatch")
    expected_threshold = model_row.get("threshold_version")
    if (
        expected_task == "classification"
        and expected_threshold
        and artifact.get("threshold_version") != expected_threshold
    ):
        raise ValueError("runtime artifact threshold version mismatch")
    cache[cache_key] = artifact
    return artifact


def load_active_models(sb: Client) -> dict[str, dict]:
    """Backward-compatible regression-only loader used by existing tests."""
    return load_active_task_models(sb)["regression"]


def load_recent_features(sb: Client) -> dict[str, list[dict]]:
    """Load only quality-gated, non-synthetic daily summaries."""
    cutoff = (datetime.now(BANGKOK).date() - timedelta(days=21)).isoformat()
    resp = (
        sb.table(OBSERVED_VIEW)
        .select(
            "province_id,date,pm25_mean,pm25_lag_1d,pm25_lag_3d,"
            "pm25_lag_7d,pm25_roll3,pm25_roll7,"
            "neighbor_pm25_avg,regional_pm25_avg,"
            "temp_mean,humidity_mean,wind_speed_mean,precip_total,"
            "hotspot_count,total_frp,month,day_of_week,"
            "is_burning_season,is_dry_season,trusted_hours,"
            "trusted_sources,trusted_observed_at,feature_provenance"
        )
        .in_("province_id", PROVINCE_IDS)
        .gte("date", cutoff)
        .order("province_id")
        .order("date")
        .limit(30 * len(PROVINCE_IDS))
        .execute()
    )
    grouped: dict[str, list[dict]] = {}
    for row in resp.data or []:
        grouped.setdefault(row["province_id"], []).append(row)
    return grouped


def load_legacy_base_models(sb: Client) -> dict[tuple[str, str], dict]:
    """Load the newest v1 base artifact while existing candidates are migrated."""
    resp = (
        sb.table("model_registry")
        .select("province_id,model_name,model_params,trained_at")
        .in_("model_name", sorted(LEGACY_BASE_MODELS))
        .order("trained_at")
        .execute()
    )
    result: dict[tuple[str, str], dict] = {}
    for row in resp.data or []:
        province_id = row.get("province_id")
        model_name = row.get("model_name")
        if province_id and model_name:
            result[(province_id, model_name)] = row.get("model_params") or {}
    return result


def _fval(row: dict, col: str, default: float = 0.0) -> float:
    value = row.get(col)
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    return parsed if math.isfinite(parsed) else default


def _at(rolling: list[float], days_back: int) -> float:
    index = len(rolling) - 1 - days_back
    return rolling[index] if index >= 0 else rolling[0]


def build_feature_vector(
    last_row: dict,
    rolling: list[float],
    feature_date: date,
    feature_cols: list[str],
    *,
    province_id: str = "",
    province_metadata: dict[str, dict[str, float]] | None = None,
    forecast_horizon_days: int = 1,
) -> np.ndarray:
    current = rolling[-1]
    values = {
        "pm25_mean": current,
        "pm25_lag_1d": _at(rolling, 1),
        "pm25_lag_3d": _at(rolling, 3),
        "pm25_lag_6d": _at(rolling, 6),
        "pm25_lag_7d": _at(rolling, 7),
        "pm25_roll3": float(np.mean(rolling[-3:])),
        "pm25_roll7": float(np.mean(rolling[-7:])),
        "neighbor_pm25_avg": _fval(last_row, "neighbor_pm25_avg", current),
        "regional_pm25_avg": _fval(last_row, "regional_pm25_avg", current),
        "temp_mean": _fval(last_row, "temp_mean", 28.0),
        "humidity_mean": _fval(last_row, "humidity_mean", 70.0),
        "wind_speed_mean": _fval(last_row, "wind_speed_mean", 2.0),
        "precip_total": _fval(last_row, "precip_total", 0.0),
        "hotspot_count": _fval(last_row, "hotspot_count", 0.0),
        "total_frp": _fval(last_row, "total_frp", 0.0),
        "month": float(feature_date.month),
        "day_of_week": float(feature_date.weekday()),
        "day_of_year_sin": math.sin(
            2.0 * math.pi * feature_date.timetuple().tm_yday / 365.25
        ),
        "day_of_year_cos": math.cos(
            2.0 * math.pi * feature_date.timetuple().tm_yday / 365.25
        ),
        "is_burning_season": 1.0 if feature_date.month in (1, 2, 3, 4) else 0.0,
        "is_dry_season": 1.0 if feature_date.month in (11, 12, 1, 2, 3, 4) else 0.0,
        "province_latitude": _fval(
            (province_metadata or {}).get(province_id, {}),
            "lat",
        ),
        "province_longitude": _fval(
            (province_metadata or {}).get(province_id, {}),
            "lon",
        ),
        "forecast_horizon_days": float(forecast_horizon_days),
    }
    for known_province_id in PROVINCE_IDS:
        values[f"province_{known_province_id.replace('-', '_')}"] = (
            1.0 if province_id == known_province_id else 0.0
        )
    missing = [name for name in feature_cols if name not in values]
    if missing:
        raise ValueError(f"unsupported artifact features: {missing}")
    return np.asarray([values[name] for name in feature_cols], dtype=float)


def evaluate_surrogate(features: np.ndarray, artifact: dict) -> float:
    """Evaluate a standardized Ridge artifact and its persistence blend."""
    cols = artifact.get("feature_cols") or []
    coefficients = np.asarray(artifact.get("coefficients") or [], dtype=float)
    means = np.asarray(artifact.get("scaler_mean") or [], dtype=float)
    scales = np.asarray(artifact.get("scaler_scale") or [], dtype=float)
    if not cols or not (len(cols) == len(features) == len(coefficients) == len(means) == len(scales)):
        raise ValueError("invalid surrogate artifact dimensions")
    if not np.all(np.isfinite(coefficients)) or not np.all(np.isfinite(means)):
        raise ValueError("surrogate artifact contains non-finite values")
    safe_scales = np.where(np.isfinite(scales) & (np.abs(scales) > 1e-12), scales, 1.0)
    surrogate = float(
        np.dot((features - means) / safe_scales, coefficients)
        + float(artifact.get("intercept", 0.0))
    )
    model_weight = float(artifact.get("model_weight", 1.0))
    if not 0 < model_weight <= 1:
        raise ValueError("invalid surrogate model weight")
    if model_weight == 1.0:
        return surrogate
    persistence_feature = artifact.get("persistence_feature", "pm25_mean")
    if persistence_feature not in cols:
        raise ValueError("invalid surrogate persistence feature")
    persistence = float(features[cols.index(persistence_feature)])
    return model_weight * surrogate + (1.0 - model_weight) * persistence


def evaluate_portable_classifier(features: np.ndarray, artifact: dict) -> dict[str, float]:
    """Evaluate the standardized logistic artifact saved by dual training."""
    cols = artifact.get("feature_cols") or []
    classes = [int(value) for value in artifact.get("classes") or []]
    coefficients = np.asarray(artifact.get("coefficients") or [], dtype=float)
    intercepts = np.asarray(artifact.get("intercepts") or [], dtype=float)
    means = np.asarray(artifact.get("scaler_mean") or [], dtype=float)
    scales = np.asarray(artifact.get("scaler_scale") or [], dtype=float)
    if (
        artifact.get("threshold_version") != THRESHOLD_VERSION
        or not cols
        or len(cols) != len(features)
        or len(means) != len(features)
        or len(scales) != len(features)
        or not classes
        or any(class_id not in CLASS_IDS for class_id in classes)
    ):
        raise ValueError("invalid portable classifier schema")
    safe_scales = np.where(
        np.isfinite(scales) & (np.abs(scales) > 1e-12),
        scales,
        1.0,
    )
    scaled = (features - means) / safe_scales
    if coefficients.ndim != 2 or coefficients.shape[1] != len(features):
        raise ValueError("invalid portable classifier coefficient dimensions")
    if len(classes) == 2 and coefficients.shape[0] == 1 and len(intercepts) == 1:
        decision = float(np.dot(coefficients[0], scaled) + intercepts[0])
        logits = np.asarray([0.0, decision], dtype=float)
    elif coefficients.shape[0] == len(classes) and len(intercepts) == len(classes):
        logits = coefficients @ scaled + intercepts
    else:
        raise ValueError("invalid portable classifier class dimensions")
    if not np.all(np.isfinite(logits)):
        raise ValueError("non-finite portable classifier output")
    temperature = float(artifact.get("temperature", 1.0))
    if not np.isfinite(temperature) or temperature <= 0:
        raise ValueError("invalid portable classifier temperature")
    shifted = logits / temperature - np.max(logits / temperature)
    compact = np.exp(shifted) / np.exp(shifted).sum()
    aligned = np.zeros(len(CLASS_IDS), dtype=float)
    for index, class_id in enumerate(classes):
        aligned[class_id - 1] = compact[index]
    normalized = np.asarray(normalize_probabilities(aligned), dtype=float)
    model_weight = float(artifact.get("model_weight", 1.0))
    if not 0 < model_weight <= 1:
        raise ValueError("invalid portable classifier model weight")
    if model_weight < 1.0:
        persistence_feature = artifact.get("persistence_feature", "pm25_mean")
        if persistence_feature not in cols:
            raise ValueError("invalid portable classifier persistence feature")
        persistence_class = class_for_pm25(
            float(features[cols.index(persistence_feature)])
        )
        persistence = np.zeros(len(CLASS_IDS), dtype=float)
        persistence[persistence_class - 1] = 1.0
        normalized = np.asarray(
            normalize_probabilities(
                model_weight * normalized + (1.0 - model_weight) * persistence
            ),
            dtype=float,
        )
    return {
        str(class_id): float(normalized[class_id - 1])
        for class_id in CLASS_IDS
    }


def recent_mean_forecast(
    rolling: list[float],
    window_days: int = FALLBACK_WINDOW_DAYS,
) -> float:
    """Forecast from the arithmetic mean of recent trusted observations."""
    if window_days < 1:
        raise ValueError("mean fallback window must be positive")
    values = np.asarray(rolling[-window_days:], dtype=float)
    values = values[np.isfinite(values) & (values >= 0)]
    baseline = float(values.mean()) if len(values) else 20.0
    return float(np.clip(baseline, 1.0, 500.0))


def legacy_weighted_forecast(
    last_row: dict,
    feature_importance: dict,
    rolling: list[float],
    feature_date: date,
) -> float:
    """Compatibility evaluator for the v1 artifacts produced by the prior trainer."""
    feature_cols = [name for name in FEATURE_COLS if name != "pm25_mean"]
    features = build_feature_vector(last_row, rolling, feature_date, feature_cols)
    weights = np.asarray([_fval(feature_importance, name) for name in feature_cols], dtype=float)
    total = float(np.sum(np.abs(weights)))
    if total <= 1e-12:
        return recent_mean_forecast(rolling)
    raw = float(np.dot(weights / total, features))
    anchor = rolling[-1]
    rescaled = raw * anchor / max(abs(raw), 1e-6)
    return float(np.clip(0.6 * rescaled + 0.4 * anchor, 1.0, 500.0))


def _predict_model(
    model_name: str,
    params: dict,
    features: np.ndarray,
    rolling: list[float],
    *,
    province_id: str = "",
    last_row: dict | None = None,
    feature_date: date | None = None,
    legacy_base_models: dict[tuple[str, str], dict] | None = None,
    runtime_artifact: dict | None = None,
) -> float:
    last_row = last_row or {}
    feature_date = feature_date or datetime.now(BANGKOK).date()
    legacy_base_models = legacy_base_models or {}
    fallback = recent_mean_forecast(rolling)
    if runtime_artifact is not None:
        try:
            return evaluate_lightgbm_regressor(features, runtime_artifact)
        except Exception:
            return fallback
    if model_name in LEGACY_BASE_MODELS:
        return legacy_weighted_forecast(
            last_row,
            params.get("feature_importance") or {},
            rolling,
            feature_date,
        )
    if model_name == LEGACY_STACKING_MODEL:
        base_name = str(params.get("base_model") or "lightgbm-v1")
        base_params = legacy_base_models.get((province_id, base_name), {})
        ml_prediction = legacy_weighted_forecast(
            last_row,
            base_params.get("feature_importance") or {},
            rolling,
            feature_date,
        )
        return (
            float(params.get("w_persist", 0.3)) * fallback
            + float(params.get("w_ml", 0.7)) * ml_prediction
        )
    if (
        model_name not in {STACKING_MODEL, SURROGATE_MODEL, ENSEMBLE6_MODEL}
        and not params.get("surrogate")
    ):
        return fallback
    artifact = params.get("surrogate") or {}
    try:
        surrogate = evaluate_surrogate(features, artifact)
    except (TypeError, ValueError):
        return fallback
    if (
        model_name in {SURROGATE_MODEL, ENSEMBLE6_MODEL}
        or not params.get("stacking")
    ):
        return surrogate
    stack = params.get("stacking") or {}
    baseline = rolling[-1] if stack.get("baseline") == "persistence-current-day" else fallback
    return (
        float(stack.get("intercept", 0.0))
        + float(stack.get("w_persist", 1.0)) * baseline
        + float(stack.get("w_surrogate", 0.0)) * surrogate
    )


def prediction_interval(
    prediction: float,
    horizon: int,
    params: dict,
    rolling: list[float],
) -> tuple[float, float, float, str]:
    """Return ordered P10/P50/P90 values and the uncertainty method."""
    artifact = params.get("surrogate") or {}
    by_horizon = params.get("residual_quantiles_by_horizon") or {}
    direct_quantiles = by_horizon.get(str(horizon))
    quantiles = (
        direct_quantiles
        or artifact.get("residual_quantiles")
        or params.get("residual_quantiles")
        or {}
    )
    try:
        offsets = [
            float(quantiles[name]) * (1.0 if direct_quantiles else math.sqrt(horizon))
            for name in ("p10", "p50", "p90")
        ]
        if not all(math.isfinite(value) for value in offsets):
            raise ValueError("non-finite residual quantile")
        method = "calibrated_chronological_residual"
    except (KeyError, TypeError, ValueError):
        recent = np.asarray(rolling[-7:], dtype=float)
        spread = float(np.std(recent, ddof=1)) if len(recent) > 1 else 0.0
        spread = max(spread, prediction * 0.10, 1.0) * math.sqrt(horizon)
        offsets = [-1.2816 * spread, 0.0, 1.2816 * spread]
        method = "uncalibrated_recent_variability"
    recent = np.asarray(rolling[-14:], dtype=float)
    innovations = np.abs(np.diff(recent))
    if len(innovations):
        variability_floor = max(
            float(np.quantile(innovations, 0.80)),
            1.0,
        ) * math.sqrt(horizon)
        widened = offsets[0] > -variability_floor or offsets[2] < variability_floor
        offsets[0] = min(offsets[0], -variability_floor)
        offsets[2] = max(offsets[2], variability_floor)
        if widened and method == "calibrated_chronological_residual":
            method = "calibrated_residual_with_variability_floor"

    values = sorted(
        float(np.clip(prediction + offset, 0.0, 500.0))
        for offset in offsets
    )
    return values[0], values[1], values[2], method


def upsert_feature_snapshots(sb: Client) -> int:
    """Persist the trusted observed feature state available at forecast time."""
    recent = load_recent_features(sb)
    now = datetime.now(timezone.utc)
    snapshots: list[dict] = []
    for province_id, history in recent.items():
        if not history:
            continue
        row = history[-1]
        feature_date = row.get("date")
        if not feature_date:
            continue
        rolling = [
            _fval(item, "pm25_mean")
            for item in history
            if item.get("pm25_mean") is not None
        ]
        if not rolling:
            continue
        vector = build_feature_vector(
            row,
            rolling,
            date.fromisoformat(feature_date),
            FEATURE_COLS,
        )
        features = {
            name: float(vector[index])
            for index, name in enumerate(FEATURE_COLS)
        }
        source_backed_features = {
            "pm25_mean",
            "neighbor_pm25_avg",
            "regional_pm25_avg",
            "temp_mean",
            "humidity_mean",
            "wind_speed_mean",
            "precip_total",
        }
        missingness = {
            name: (
                row.get(name) is None
                if name in source_backed_features
                else False
            )
            for name in FEATURE_COLS
        }
        trusted_at = row.get("trusted_observed_at")
        latency = None
        if trusted_at:
            try:
                parsed = datetime.fromisoformat(str(trusted_at).replace("Z", "+00:00"))
                latency = max(0, int((now - parsed).total_seconds()))
            except ValueError:
                latency = None
        snapshots.append({
            "province_id": province_id,
            "feature_date": feature_date,
            "feature_version": "daily-observed-v4",
            "features": features,
            "provenance": (
                row.get("feature_provenance")
                or {
                    "trusted_sources": row.get("trusted_sources") or [],
                    "synthetic_allowed": False,
                }
            ),
            "missingness": missingness,
            "quality_status": (
                "trusted"
                if int(row.get("trusted_hours") or 0) >= 18
                else "insufficient_hours"
            ),
            "source_latency_seconds": latency,
        })
    if not snapshots:
        return 0
    sb.table("feature_snapshots").upsert(
        snapshots,
        on_conflict="province_id,feature_date,feature_version",
    ).execute()
    return len(snapshots)


def make_forecasts(sb: Client, horizon: int = 7) -> list[dict]:
    active_tasks = load_active_task_models(sb)
    active_models = active_tasks["regression"]
    active_classifiers = active_tasks["classification"]
    recent = load_recent_features(sb)
    needs_province_metadata = any(
        (row.get("model_params") or {}).get("runtime_kind")
        == TREE_ARTIFACT_SCHEMA
        for row in [*active_models.values(), *active_classifiers.values()]
    )
    province_metadata = (
        load_province_metadata(sb) if needs_province_metadata else {}
    )
    runtime_cache: dict[str, dict] = {}
    needs_legacy = any(
        row.get("model_name") in LEGACY_BASE_MODELS | {LEGACY_STACKING_MODEL}
        for row in active_models.values()
    )
    legacy_base_models = load_legacy_base_models(sb) if needs_legacy else {}
    forecast_at = datetime.now(timezone.utc).isoformat()
    bangkok_today = datetime.now(BANGKOK).date()
    rows_out: list[dict] = []

    for province_id in PROVINCE_IDS:
        model_row = active_models.get(province_id)
        history = recent.get(province_id, [])
        if not history:
            continue

        last_row = history[-1]
        as_of = date.fromisoformat(last_row["date"])
        if (bangkok_today - as_of).days > MAX_SOURCE_AGE_DAYS:
            continue
        rolling = [_fval(row, "pm25_mean") for row in history if row.get("pm25_mean") is not None]
        if not rolling:
            continue

        params = model_row.get("model_params") or {} if model_row else {}
        requires_tree_regression = params.get("runtime_kind") == TREE_ARTIFACT_SCHEMA
        try:
            regression_tree = load_runtime_artifact(sb, model_row, runtime_cache)
        except Exception:
            regression_tree = None
        fallback_regression = (
            model_row is None
            or model_row.get("eligibility_status") is False
            or model_row.get("model_name") == LEGACY_PERSIST_MODEL
            or (requires_tree_regression and regression_tree is None)
        )
        if fallback_regression:
            # Never present a rejected/broken candidate or the retired
            # persistence/reversion baseline as an ML forecast.
            params = {}
            regression_tree = None
            model_name = FALLBACK_MODEL_NAME
            regression_run_id = None
        else:
            model_name = model_row["model_name"]
            regression_run_id = model_row.get("run_id")
        classifier_row = active_classifiers.get(province_id)
        classifier_params = (
            classifier_row.get("model_params") or {}
            if classifier_row else {}
        )
        classifier_artifact = classifier_params.get("portable_classifier") or {}
        requires_tree_classifier = (
            classifier_params.get("runtime_kind") == TREE_ARTIFACT_SCHEMA
        )
        try:
            classifier_tree = load_runtime_artifact(
                sb,
                classifier_row,
                runtime_cache,
            )
        except Exception:
            classifier_tree = None
        serving_policy = classifier_params.get("serving_policy") or SERVING_POLICY
        if serving_policy not in SUPPORTED_SERVING_POLICIES:
            serving_policy = "classifier_with_regression_fallback"
        artifact = params.get("surrogate") or {}
        feature_cols = (
            (regression_tree or {}).get("feature_cols")
            or artifact.get("feature_cols")
            or FEATURE_COLS
        )
        classifier_feature_cols = (
            (classifier_tree or {}).get("feature_cols")
            or classifier_artifact.get("feature_cols")
            or feature_cols
        )
        source_gap_days = max(0, (bangkok_today - as_of).days)
        direct_horizon = bool(
            regression_tree
            and params.get("target_strategy") == "direct_observed_horizon"
            and horizon <= max(params.get("trained_horizons") or [1])
        )

        # Bridge a one/two-day source delay with D+1 predictions before using
        # the current Bangkok business date as the direct forecast origin.
        if direct_horizon:
            for bridge_step in range(1, source_gap_days + 1):
                bridge_origin = as_of + timedelta(days=bridge_step - 1)
                bridge_features = build_feature_vector(
                    last_row,
                    rolling,
                    bridge_origin,
                    feature_cols,
                    province_id=province_id,
                    province_metadata=province_metadata,
                    forecast_horizon_days=1,
                )
                bridge_prediction = float(np.clip(_predict_model(
                    model_name,
                    params,
                    bridge_features,
                    rolling,
                    province_id=province_id,
                    last_row=last_row,
                    feature_date=bridge_origin,
                    legacy_base_models=legacy_base_models,
                    runtime_artifact=regression_tree,
                ), 1.0, 500.0))
                rolling.append(bridge_prediction)

        predictions_to_emit: list[tuple[int, date, date, np.ndarray, float]] = []
        if direct_horizon:
            origin_date = as_of + timedelta(days=source_gap_days)
            for forecast_horizon in range(1, horizon + 1):
                features = build_feature_vector(
                    last_row,
                    rolling,
                    origin_date,
                    feature_cols,
                    province_id=province_id,
                    province_metadata=province_metadata,
                    forecast_horizon_days=forecast_horizon,
                )
                prediction = float(np.clip(_predict_model(
                    model_name,
                    params,
                    features,
                    rolling,
                    province_id=province_id,
                    last_row=last_row,
                    feature_date=origin_date,
                    legacy_base_models=legacy_base_models,
                    runtime_artifact=regression_tree,
                ), 1.0, 500.0))
                predictions_to_emit.append((
                    forecast_horizon,
                    origin_date,
                    origin_date + timedelta(days=forecast_horizon),
                    features,
                    prediction,
                ))
        else:
            total_recursive_steps = source_gap_days + horizon
            for recursive_step in range(1, total_recursive_steps + 1):
                feature_date = as_of + timedelta(days=recursive_step - 1)
                target_date = as_of + timedelta(days=recursive_step)
                features = build_feature_vector(
                    last_row,
                    rolling,
                    feature_date,
                    feature_cols,
                    province_id=province_id,
                    province_metadata=province_metadata,
                    forecast_horizon_days=1,
                )
                prediction = float(np.clip(_predict_model(
                    model_name,
                    params,
                    features,
                    rolling,
                    province_id=province_id,
                    last_row=last_row,
                    feature_date=feature_date,
                    legacy_base_models=legacy_base_models,
                    runtime_artifact=regression_tree,
                ), 1.0, 500.0))
                rolling.append(prediction)
                if target_date <= bangkok_today:
                    continue
                predictions_to_emit.append((
                    (target_date - bangkok_today).days,
                    feature_date,
                    target_date,
                    features,
                    prediction,
                ))

        for forecast_horizon, feature_date, target_date, features, prediction in predictions_to_emit:
            p10, p50, p90, uncertainty_method = prediction_interval(
                prediction,
                forecast_horizon,
                params,
                rolling,
            )
            regression_class = class_for_pm25(prediction)
            classifier_class = None
            probabilities = None
            confidence = None
            classification_source = "regression_threshold"
            fallback_used = True
            fallback_reason = "no_eligible_active_classifier"
            if (
                forecast_horizon == 1
                and classifier_row
                and classifier_row.get("eligibility_status") is True
                and serving_policy != "regression_threshold"
            ):
                try:
                    classifier_features = build_feature_vector(
                        last_row,
                        rolling,
                        feature_date,
                        classifier_feature_cols,
                        province_id=province_id,
                        province_metadata=province_metadata,
                        forecast_horizon_days=forecast_horizon,
                    )
                    probabilities = (
                        evaluate_random_forest_classifier(
                            classifier_features,
                            classifier_tree,
                            class_ids=CLASS_IDS,
                        )
                        if classifier_tree is not None
                        else evaluate_portable_classifier(
                            classifier_features,
                            classifier_artifact,
                        )
                    )
                    classifier_class = max(
                        CLASS_IDS,
                        key=lambda class_id: probabilities[str(class_id)],
                    )
                    confidence = probabilities[str(classifier_class)]
                    classification_source = "active_classifier"
                    fallback_used = False
                    fallback_reason = None
                except (KeyError, TypeError, ValueError):
                    fallback_reason = (
                        "missing_tree_classifier_artifact"
                        if requires_tree_classifier and classifier_tree is None
                        else "invalid_classifier_artifact"
                    )
            elif forecast_horizon > 1:
                fallback_reason = "experimental_horizon_regression_threshold"
            displayed_class = (
                classifier_class
                if classification_source == "active_classifier"
                else regression_class
            )
            if probabilities is None:
                probabilities = {
                    str(class_id): 1.0 if class_id == displayed_class else 0.0
                    for class_id in CLASS_IDS
                }
            definition = class_definition(displayed_class)
            rows_out.append({
                "province_id": province_id,
                "forecast_at": forecast_at,
                "target_date": target_date.isoformat(),
                "pm25_mean_forecast": round(prediction, 2),
                "pm25_max_forecast": round(p90, 2),
                "pm25_p10_forecast": round(p10, 2),
                "pm25_p50_forecast": round(p50, 2),
                "pm25_p90_forecast": round(p90, 2),
                "model_name": model_name,
                "regression_model_name": model_name,
                "regression_run_id": regression_run_id,
                "regression_derived_class": regression_class,
                "classifier_predicted_class": classifier_class,
                "displayed_class": displayed_class,
                "class_label_th": definition.label_th,
                "class_label_en": definition.label_en,
                "classifier_model_name": (
                    classifier_row.get("model_name") if classifier_row else None
                ),
                "classifier_run_id": (
                    classifier_row.get("run_id") if classifier_row else None
                ),
                "confidence": (
                    round(float(confidence), 6)
                    if confidence is not None else None
                ),
                "class_probabilities": probabilities,
                "class_agreement": (
                    classifier_class == regression_class
                    if classifier_class is not None else None
                ),
                "classification_source": classification_source,
                "fallback_used": fallback_used or fallback_regression,
                "fallback_reason": (
                    "mean_regression_fallback"
                    if fallback_regression else fallback_reason
                ),
                "data_freshness": f"{as_of.isoformat()}T23:59:59+07:00",
                "feature_version": (
                    params.get("feature_version")
                    or classifier_params.get("feature_version")
                    or "daily-observed-v4"
                ),
                "forecast_horizon_days": forecast_horizon,
                "horizon_reliability": (
                    "evaluated_d1"
                    if forecast_horizon == 1
                    else (
                        "experimental_direct"
                        if direct_horizon
                        else "experimental_recursive"
                    )
                ),
                "is_experimental": forecast_horizon > 1,
                "uncertainty_method": uncertainty_method,
            })

    return rows_out


def upsert_forecasts(sb: Client, rows: list[dict]) -> int:
    if not rows:
        return 0
    resp = sb.rpc("fn_upsert_forecast_daily", {"rows": rows}).execute()
    return (resp.data or {}).get("upserted", len(rows))


def execute_forecast_run(sb: Client, horizon: int) -> tuple[list[dict], int, int]:
    """Evaluate due forecasts, generate a new auditable batch and close its run."""
    run_id = str(uuid.uuid4())
    started_at = datetime.now(timezone.utc).isoformat()
    sb.table("forecast_runs").insert({
        "run_id": run_id,
        "forecast_at": started_at,
        "feature_version": None,
        "code_version": os.environ.get("VERCEL_GIT_COMMIT_SHA") or "unversioned",
        "serving_policy": SERVING_POLICY,
        "horizon_days": horizon,
        "status": "running",
        "configuration": {
            "validated_horizons": [1],
            "experimental_horizons": list(range(2, horizon + 1)),
        },
    }).execute()
    try:
        evaluation_response = sb.rpc("fn_evaluate_due_forecasts").execute()
        evaluated = int((evaluation_response.data or {}).get("evaluated", 0))
        drift_response = sb.rpc("fn_refresh_model_drift_metrics").execute()
        drift_rows = int((drift_response.data or {}).get("upserted", 0))
        snapshot_count = upsert_feature_snapshots(sb)
        rows = make_forecasts(sb, horizon)
        for row in rows:
            row["forecast_run_id"] = run_id
        count = upsert_forecasts(sb, rows)
        if rows:
            sb.table("forecast_daily").update({
                "forecast_run_id": run_id,
            }).eq("forecast_at", rows[0]["forecast_at"]).execute()
        province_count = len({row["province_id"] for row in rows})
        expected_rows = len(PROVINCE_IDS) * horizon
        required_fields_ok = all(
            row.get("province_id") and row.get("target_date")
            for row in rows
        )
        unique_forecasts = {
            (row.get("province_id"), row.get("target_date"))
            for row in rows
        }
        valid_values = all(
            row.get("pm25_mean_forecast") is not None
            and math.isfinite(float(row["pm25_mean_forecast"]))
            and float(row["pm25_mean_forecast"]) >= 0
            for row in rows
        )
        integrity_ok = (
            required_fields_ok
            and province_count == len(PROVINCE_IDS)
            and len(rows) == expected_rows
            and len(unique_forecasts) == expected_rows
            and count == expected_rows
            and valid_values
        )
        status = "success" if integrity_ok else "partial"
        feature_versions = sorted({
            str(row["feature_version"])
            for row in rows
            if row.get("feature_version")
        })
        feature_version = (
            feature_versions[0]
            if len(feature_versions) == 1
            else "mixed:" + ",".join(feature_versions)
        ) if feature_versions else None
        model_counts: dict[str, int] = {}
        for row in rows:
            model_name = str(row.get("model_name") or "unknown")
            model_counts[model_name] = model_counts.get(model_name, 0) + 1
        sb.table("forecast_runs").update({
            "status": status,
            "feature_version": feature_version,
            "source_as_of": max(
                (row["data_freshness"] for row in rows),
                default=None,
            ),
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "configuration": {
                "validated_horizons": [1],
                "experimental_horizons": list(range(2, horizon + 1)),
                "province_count": province_count,
                "forecast_rows": count,
                "expected_forecast_rows": expected_rows,
                "unique_forecasts": len(unique_forecasts),
                "integrity_ok": integrity_ok,
                "model_counts": model_counts,
                "evaluated_previous_rows": evaluated,
                "drift_rows": drift_rows,
                "feature_snapshots": snapshot_count,
            },
        }).eq("run_id", run_id).execute()
        return rows, count, evaluated
    except Exception as exc:
        sb.table("forecast_runs").update({
            "status": "error",
            "error_message": f"{type(exc).__name__}: {exc}"[:1000],
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }).eq("run_id", run_id).execute()
        raise


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self._send(200, {
            "status": "ok",
            "endpoint": "api/ml/forecast",
            "models": [
                PERSIST_MODEL,
                *sorted(LEGACY_BASE_MODELS),
                LEGACY_STACKING_MODEL,
                SURROGATE_MODEL,
                ENSEMBLE6_MODEL,
                STACKING_MODEL,
                LEGACY_POOLED_LIGHTGBM_MODEL,
                POOLED_LIGHTGBM_MODEL,
                POOLED_RF_CLASSIFIER,
            ],
            "observed_view": OBSERVED_VIEW,
        })

    def do_POST(self):
        if _is_production() and not ML_SECRET:
            return self._send(503, {"error": "ML_SECRET is required in production"})
        if not _authorized(dict(self.headers)):
            return self._send(401, {"error": "Unauthorized"})
        if not SUPABASE_URL or not SUPABASE_KEY:
            return self._send(500, {"error": "Supabase env vars not set"})
        try:
            length = int(self.headers.get("Content-Length", 0))
            if length > 4096:
                return self._send(413, {"error": "Request body too large"})
            body = json.loads(self.rfile.read(length)) if length else {}
            if not isinstance(body, dict):
                return self._send(400, {"error": "JSON body must be an object"})
            horizon = _parse_horizon(body)
            sb = get_client()
            rows, count, evaluated = execute_forecast_run(sb, horizon)
        except json.JSONDecodeError:
            return self._send(400, {"error": "Invalid JSON body"})
        except ValueError as exc:
            return self._send(400, {"error": str(exc)})
        except Exception:
            return self._send(500, {"error": "Forecast generation failed"})

        model_counts: dict[str, int] = {}
        for row in rows:
            model_counts[row["model_name"]] = model_counts.get(row["model_name"], 0) + 1
        self._send(200, {
            "ok": True,
            "upserted": count,
            "provinces": len({row["province_id"] for row in rows}),
            "horizon": horizon,
            "evaluated_previous_rows": evaluated,
            "model_counts": model_counts,
        })

    def _send(self, code: int, body: dict):
        payload = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *args):
        pass
