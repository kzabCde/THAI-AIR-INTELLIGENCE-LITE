"""
POST /api/ml/forecast
GET  /api/ml/forecast  — health check

Loads active model_registry rows and evaluates the distilled standardized
Ridge surrogate stored in model_params. Native XGBoost/LightGBM artifacts stay
in Colab/ZIP storage; Vercel only needs coef/intercept/scaler metadata. If the
surrogate artifact is missing or malformed, the endpoint falls back to
persist-revert-v2 for that province.

Query pattern:
  Q1: model_registry WHERE is_active=true → active model per province
  Q2: training_daily_summary_v2 latest rows → current features for inference

No xgboost/lightgbm in runtime → cold start stays small.
"""

import hmac
import json
import os
from datetime import date, timedelta, timezone, datetime
from http.server import BaseHTTPRequestHandler

import numpy as np
from supabase import create_client, Client

# ── Environment ───────────────────────────────────────────────────────
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
ML_SECRET    = os.environ.get("ML_SECRET", "")

# ── Constants ─────────────────────────────────────────────────────────
FEATURE_COLS = [
    "pm25_lag_1d", "pm25_lag_3d", "pm25_lag_7d",
    "pm25_roll7", "neighbor_pm25_avg", "regional_pm25_avg",
    "temp_mean", "humidity_mean", "wind_speed_mean", "precip_total",
    "hotspot_count", "total_frp",
    "month", "day_of_week", "is_burning_season", "is_dry_season",
]

PROVINCE_IDS = [
    "TH-30","TH-31","TH-32","TH-33","TH-34",
    "TH-35","TH-36","TH-37","TH-38","TH-39",
    "TH-40","TH-41","TH-42","TH-43","TH-44",
    "TH-45","TH-46","TH-47","TH-48","TH-49",
]

SURROGATE_MODELS = {"xgb-lgbm-pm25-nextday-v2", "xgb-lgbm-ensemble-v1", "stacking-v1", "lightgbm-v1", "xgboost-v1"}
FALLBACK_MODEL = "persist-revert-v2"


# ── Auth ──────────────────────────────────────────────────────────────
def _is_production() -> bool:
    return os.environ.get("NODE_ENV") == "production" or os.environ.get("VERCEL_ENV") == "production"


def _authorized(headers: dict) -> bool:
    if not ML_SECRET:
        return not _is_production()
    auth = headers.get("Authorization") or headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return False
    token = auth.split(" ", 1)[1]
    return hmac.compare_digest(token, ML_SECRET)


def _parse_horizon(body: dict) -> int:
    raw = body.get("horizon", 7)
    if isinstance(raw, bool):
        raise ValueError("horizon must be an integer between 1 and 14")
    try:
        horizon = int(raw)
    except (TypeError, ValueError):
        raise ValueError("horizon must be an integer between 1 and 14")
    if horizon < 1 or horizon > 14 or str(raw).strip() != str(horizon):
        raise ValueError("horizon must be an integer between 1 and 14")
    return horizon


def get_client() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_KEY)


# ── Q1: โหลด active model ทุกจังหวัด ─────────────────────────────────
def load_active_models(sb: Client) -> dict:
    """Return one active model row per province.

    The database migration enforces this invariant with a partial unique index;
    this function still keeps the newest trained_at row if legacy duplicates are
    present so inference remains deterministic.
    """
    resp = sb.table("model_registry") \
        .select("province_id,model_name,model_params,mae,trained_at") \
        .eq("is_active", True) \
        .order("trained_at", desc=True) \
        .execute()

    result: dict = {}
    for r in (resp.data or []):
        pid = r["province_id"]
        if pid not in result:
            result[pid] = r
    return result


# ── Q2: โหลด training_daily_summary_v2 14 วันล่าสุด ────────────────
def load_recent_features(sb: Client) -> dict:
    """return: { province_id: [rows sorted by date asc] }"""
    cutoff = (date.today() - timedelta(days=21)).isoformat()
    select_cols = (
        "province_id,date,pm25_mean,pm25_hours,is_synthetic,source,"
        "pm25_lag_1d,pm25_lag_3d,pm25_lag_7d,pm25_roll7,"
        "neighbor_pm25_avg,regional_pm25_avg,"
        "temp_mean,humidity_mean,wind_speed_mean,precip_total,"
        "hotspot_count,total_frp,month,day_of_week,"
        "is_burning_season,is_dry_season"
    )
    try:
        resp = sb.table("training_daily_summary_v2") \
            .select(select_cols) \
            .in_("province_id", PROVINCE_IDS) \
            .gte("date", cutoff) \
            .eq("is_synthetic", False) \
            .gte("pm25_hours", 18) \
            .order("province_id") \
            .order("date") \
            .limit(32 * len(PROVINCE_IDS)) \
            .execute()
    except Exception:
        resp = sb.table("daily_summary") \
            .select(select_cols.replace("pm25_hours,is_synthetic,", "")) \
            .in_("province_id", PROVINCE_IDS) \
            .gte("date", cutoff) \
            .order("province_id") \
            .order("date") \
            .limit(32 * len(PROVINCE_IDS)) \
            .execute()

    by_province: dict = {}
    for row in (resp.data or []):
        by_province.setdefault(row["province_id"], []).append(row)
    return by_province


# ── Helpers ──────────────────────────────────────────────────────────
def _fval(row: dict, col: str, default: float = 0.0) -> float:
    v = row.get(col)
    if v is None:
        return default
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def build_feature_vector(last_row: dict, rolling: list, target_date: date) -> list[float]:
    lag1 = rolling[-1] if len(rolling) >= 1 else _fval(last_row, "pm25_mean", 20.0)
    lag3 = rolling[-3] if len(rolling) >= 3 else lag1
    lag7 = rolling[-7] if len(rolling) >= 7 else lag1
    values = {
        "pm25_lag_1d": lag1,
        "pm25_lag_3d": lag3,
        "pm25_lag_7d": lag7,
        "pm25_roll7": float(np.mean(rolling[-7:])) if len(rolling) >= 7 else lag1,
        "neighbor_pm25_avg": _fval(last_row, "neighbor_pm25_avg", lag1),
        "regional_pm25_avg": _fval(last_row, "regional_pm25_avg", lag1),
        "temp_mean": _fval(last_row, "temp_mean", 28.0),
        "humidity_mean": _fval(last_row, "humidity_mean", 70.0),
        "wind_speed_mean": _fval(last_row, "wind_speed_mean", 2.0),
        "precip_total": _fval(last_row, "precip_total", 0.0),
        "hotspot_count": _fval(last_row, "hotspot_count", 0.0),
        "total_frp": _fval(last_row, "total_frp", 0.0),
        "month": float(target_date.month),
        "day_of_week": float(target_date.weekday()),
        "is_burning_season": 1.0 if target_date.month in (1, 2, 3, 4) else 0.0,
        "is_dry_season": 1.0 if target_date.month in (11, 12, 1, 2, 3, 4) else 0.0,
    }
    return [values[c] for c in FEATURE_COLS]


def surrogate_forecast(params: dict, features: list[float]) -> tuple[float, float]:
    """Evaluate standardized Ridge surrogate and return (mean, residual_p90)."""
    feature_order = params.get("feature_order") or params.get("features")
    coef = params.get("coef") or params.get("coefficients")
    intercept = params.get("intercept")
    scaler_mean = params.get("scaler_mean")
    scaler_scale = params.get("scaler_scale")
    if feature_order != FEATURE_COLS:
        raise ValueError("feature_order mismatch")
    if not (isinstance(coef, list) and isinstance(scaler_mean, list) and isinstance(scaler_scale, list)):
        raise ValueError("surrogate arrays missing")
    if len(coef) != len(FEATURE_COLS) or len(scaler_mean) != len(FEATURE_COLS) or len(scaler_scale) != len(FEATURE_COLS):
        raise ValueError("surrogate arrays length mismatch")
    z = [(float(x) - float(mu)) / (float(sig) if abs(float(sig)) > 1e-12 else 1.0)
         for x, mu, sig in zip(features, scaler_mean, scaler_scale)]
    pred = float(intercept) + sum(float(c) * v for c, v in zip(coef, z))
    residual_p90 = float(params.get("residual_p90", params.get("prediction_interval_residual_p90", 0.0)) or 0.0)
    return float(np.clip(pred, 1.0, 500.0)), max(0.0, residual_p90)


# ── Inference: persist-revert-v2 ─────────────────────────────────────
def persist_revert_forecast(rolling: list, roll7_val: float, h: int) -> float:
    """ŷ_h = current-day pm25_mean + (1 - 0.85^h) × (roll7 - current-day pm25_mean)."""
    last = rolling[-1] if rolling else 20.0
    return float(np.clip(last + (1 - 0.85 ** h) * (roll7_val - last), 1.0, 500.0))


# ── Main forecast logic ───────────────────────────────────────────────
def make_forecasts(sb: Client, horizon: int = 7) -> list:
    active_models = load_active_models(sb)
    features = load_recent_features(sb)
    forecast_at = datetime.now(timezone.utc).isoformat()
    rows_out = []

    for pid in PROVINCE_IDS:
        model_row = active_models.get(pid)
        hist = features.get(pid, [])
        if not hist:
            continue
        model_name = (model_row or {}).get("model_name") or FALLBACK_MODEL
        params = (model_row or {}).get("model_params") or {}
        last_row = hist[-1]
        origin = date.fromisoformat(str(last_row["date"]))
        rolling = [float(r.get("pm25_mean") or 0) for r in hist if float(r.get("pm25_mean") or 0) > 0]
        if not rolling:
            continue
        roll7_now = float(np.mean(rolling[-7:])) if len(rolling) >= 7 else rolling[-1]

        for h in range(1, horizon + 1):
            target_date = origin + timedelta(days=h)
            effective_model = model_name
            residual_p90 = 0.0
            try:
                if model_name in SURROGATE_MODELS:
                    fvec = build_feature_vector(last_row, rolling, target_date)
                    pm25_pred, residual_p90 = surrogate_forecast(params, fvec)
                else:
                    raise ValueError("unsupported model")
            except Exception:
                effective_model = FALLBACK_MODEL
                pm25_pred = persist_revert_forecast(rolling, roll7_now, h)
                residual_p90 = float(params.get("residual_p90", 0.0) or 0.0)

            pm25_pred = float(np.clip(pm25_pred, 1.0, 500.0))
            rows_out.append({
                "province_id": pid,
                "forecast_at": forecast_at,
                "target_date": target_date.isoformat(),
                "pm25_mean_forecast": round(pm25_pred, 2),
                "pm25_max_forecast": round(float(np.clip(pm25_pred + residual_p90, pm25_pred, 500.0)), 2),
                "model_name": effective_model,
            })
            rolling.append(pm25_pred)

    return rows_out


def upsert_forecasts(sb: Client, rows: list) -> int:
    if not rows:
        return 0
    resp = sb.rpc("fn_upsert_forecast_daily", {"rows": rows}).execute()
    if resp.data:
        return resp.data.get("upserted", len(rows))
    return len(rows)


# ── HTTP Handler ──────────────────────────────────────────────────────
class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self._send(200, {
            "status":   "ok",
            "endpoint": "api/ml/forecast",
            "models":   sorted(SURROGATE_MODELS | {FALLBACK_MODEL}),
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
        except json.JSONDecodeError:
            return self._send(400, {"error": "Invalid JSON body"})
        except ValueError as exc:
            return self._send(400, {"error": str(exc)})

        sb   = get_client()
        rows = make_forecasts(sb, horizon)
        n    = upsert_forecasts(sb, rows)

        model_counts: dict = {}
        for r in rows:
            model_counts[r["model_name"]] = model_counts.get(r["model_name"], 0) + 1

        self._send(200, {
            "ok":           True,
            "upserted":     n,
            "provinces":    len(set(r["province_id"] for r in rows)),
            "horizon":      horizon,
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
