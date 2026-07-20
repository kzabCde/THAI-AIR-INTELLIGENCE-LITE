"""Lightweight PM2.5 inference endpoint.

Production evaluates a leakage-safe linear surrogate distilled from the selected
teacher among six tree ensembles. It never treats feature importance as coefficients.
If an artifact is missing or invalid, the endpoint falls back to the explicit
persist-revert model for that province.
"""

from __future__ import annotations

import hmac
import json
import math
import os
from datetime import date, datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler
from zoneinfo import ZoneInfo

import numpy as np
from supabase import Client, create_client

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
ML_SECRET = os.environ.get("ML_SECRET", "")

BANGKOK = ZoneInfo("Asia/Bangkok")
MAX_SOURCE_AGE_DAYS = 2
OBSERVED_VIEW = "training_daily_summary_v2"
STACKING_MODEL = "stacking-v2"
SURROGATE_MODEL = "surrogate-v2"
ENSEMBLE6_MODEL = "ensemble6-pm25-v3"
PERSIST_MODEL = "persist-revert-v2"
LEGACY_STACKING_MODEL = "stacking-v1"
LEGACY_BASE_MODELS = {"lightgbm-v1", "xgboost-v1"}

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


def load_active_models(sb: Client) -> dict[str, dict]:
    """Load exactly one active model per province; duplicates are a hard error."""
    resp = (
        sb.table("model_registry")
        .select("province_id,model_name,model_params,mae,rmse,r2")
        .eq("is_active", True)
        .execute()
    )
    result: dict[str, dict] = {}
    for row in resp.data or []:
        province_id = row.get("province_id")
        if not province_id:
            continue
        if province_id in result:
            raise RuntimeError(f"multiple active models for {province_id}")
        result[province_id] = row
    return result


def load_recent_features(sb: Client) -> dict[str, list[dict]]:
    """Load only quality-gated, non-synthetic daily summaries."""
    cutoff = (datetime.now(BANGKOK).date() - timedelta(days=21)).isoformat()
    resp = (
        sb.table(OBSERVED_VIEW)
        .select(
            "province_id,date,pm25_mean,pm25_lag_1d,pm25_lag_3d,"
            "pm25_lag_7d,pm25_roll7,neighbor_pm25_avg,regional_pm25_avg,"
            "temp_mean,humidity_mean,wind_speed_mean,precip_total,"
            "hotspot_count,total_frp,month,day_of_week,"
            "is_burning_season,is_dry_season,trusted_hours"
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
) -> np.ndarray:
    current = rolling[-1]
    values = {
        "pm25_mean": current,
        "pm25_lag_1d": _at(rolling, 1),
        "pm25_lag_3d": _at(rolling, 3),
        "pm25_lag_7d": _at(rolling, 7),
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
        "is_burning_season": 1.0 if feature_date.month in (1, 2, 3, 4) else 0.0,
        "is_dry_season": 1.0 if feature_date.month in (11, 12, 1, 2, 3, 4) else 0.0,
    }
    missing = [name for name in feature_cols if name not in values]
    if missing:
        raise ValueError(f"unsupported artifact features: {missing}")
    return np.asarray([values[name] for name in feature_cols], dtype=float)


def evaluate_surrogate(features: np.ndarray, artifact: dict) -> float:
    """Evaluate a standardized Ridge artifact produced by the training job."""
    cols = artifact.get("feature_cols") or []
    coefficients = np.asarray(artifact.get("coefficients") or [], dtype=float)
    means = np.asarray(artifact.get("scaler_mean") or [], dtype=float)
    scales = np.asarray(artifact.get("scaler_scale") or [], dtype=float)
    if not cols or not (len(cols) == len(features) == len(coefficients) == len(means) == len(scales)):
        raise ValueError("invalid surrogate artifact dimensions")
    if not np.all(np.isfinite(coefficients)) or not np.all(np.isfinite(means)):
        raise ValueError("surrogate artifact contains non-finite values")
    safe_scales = np.where(np.isfinite(scales) & (np.abs(scales) > 1e-12), scales, 1.0)
    return float(np.dot((features - means) / safe_scales, coefficients) + float(artifact.get("intercept", 0.0)))


def persist_revert_forecast(rolling: list[float], h: int, alpha: float = 0.85) -> float:
    current = rolling[-1] if rolling else 20.0
    roll7 = float(np.mean(rolling[-7:])) if rolling else current
    return float(np.clip(current + (1 - alpha**h) * (roll7 - current), 1.0, 500.0))


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
        return persist_revert_forecast(rolling, h=1)
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
) -> float:
    last_row = last_row or {}
    feature_date = feature_date or datetime.now(BANGKOK).date()
    legacy_base_models = legacy_base_models or {}
    fallback = persist_revert_forecast(rolling, h=1)
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
    if model_name not in {STACKING_MODEL, SURROGATE_MODEL, ENSEMBLE6_MODEL}:
        return fallback
    artifact = params.get("surrogate") or {}
    try:
        surrogate = evaluate_surrogate(features, artifact)
    except (TypeError, ValueError):
        return fallback
    if model_name in {SURROGATE_MODEL, ENSEMBLE6_MODEL}:
        return surrogate
    stack = params.get("stacking") or {}
    baseline = rolling[-1] if stack.get("baseline") == "persistence-current-day" else fallback
    return (
        float(stack.get("intercept", 0.0))
        + float(stack.get("w_persist", 1.0)) * baseline
        + float(stack.get("w_surrogate", 0.0)) * surrogate
    )


def make_forecasts(sb: Client, horizon: int = 7) -> list[dict]:
    active_models = load_active_models(sb)
    recent = load_recent_features(sb)
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
        if not model_row or not history:
            continue

        last_row = history[-1]
        as_of = date.fromisoformat(last_row["date"])
        if (bangkok_today - as_of).days > MAX_SOURCE_AGE_DAYS:
            continue
        rolling = [_fval(row, "pm25_mean") for row in history if row.get("pm25_mean") is not None]
        if not rolling:
            continue

        model_name = model_row["model_name"]
        params = model_row.get("model_params") or {}
        artifact = params.get("surrogate") or {}
        feature_cols = artifact.get("feature_cols") or FEATURE_COLS
        upper_q90 = max(0.0, float(params.get("upper_residual_q90", 0.0)))

        for h in range(1, horizon + 1):
            feature_date = as_of + timedelta(days=h - 1)
            target_date = as_of + timedelta(days=h)
            features = build_feature_vector(last_row, rolling, feature_date, feature_cols)
            prediction = float(np.clip(_predict_model(
                model_name,
                params,
                features,
                rolling,
                province_id=province_id,
                last_row=last_row,
                feature_date=feature_date,
                legacy_base_models=legacy_base_models,
            ), 1.0, 500.0))
            upper = (
                prediction + upper_q90 * math.sqrt(h)
                if upper_q90 > 0
                else prediction * 1.35
            )
            upper = float(np.clip(upper, prediction, 500.0))
            rows_out.append({
                "province_id": province_id,
                "forecast_at": forecast_at,
                "target_date": target_date.isoformat(),
                "pm25_mean_forecast": round(prediction, 2),
                "pm25_max_forecast": round(upper, 2),
                "model_name": model_name,
            })
            rolling.append(prediction)

    return rows_out


def upsert_forecasts(sb: Client, rows: list[dict]) -> int:
    if not rows:
        return 0
    resp = sb.rpc("fn_upsert_forecast_daily", {"rows": rows}).execute()
    return (resp.data or {}).get("upserted", len(rows))


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
            rows = make_forecasts(sb, horizon)
            count = upsert_forecasts(sb, rows)
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
