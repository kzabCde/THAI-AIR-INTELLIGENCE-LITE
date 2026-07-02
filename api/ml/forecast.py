"""
POST /api/ml/forecast
GET  /api/ml/forecast  — health check

รองรับ 3 model types จาก model_registry:
  1. stacking-v1    → Learned Stacking (Option B)
                      query base model แยก แล้ว combine
                      ŷ = w_persist × persist_revert + w_ml × ml_weighted
  2. lightgbm-v1   → feature importance weighted (fallback)
  3. xgboost-v1    → feature importance weighted (fallback)

Query pattern (ทั้งหมด 3 queries ต่อ request):
  Q1: model_registry WHERE is_active=true          → active model per province
  Q2: model_registry WHERE model_name IN (base)    → base model feature_importance
  Q3: daily_summary 14 วันล่าสุด ทุกจังหวัดใน query เดียว → features สำหรับ inference

ไม่มี xgboost/lightgbm ใน runtime → cold start เร็ว จบใน maxDuration ของ Vercel
"""

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

STACKING_MODEL  = "stacking-v1"
BASE_ML_MODELS  = {"lightgbm-v1", "xgboost-v1"}


# ── Auth ──────────────────────────────────────────────────────────────
def _authorized(headers: dict) -> bool:
    if not ML_SECRET:
        return True
    auth = headers.get("Authorization") or headers.get("authorization", "")
    return auth == f"Bearer {ML_SECRET}"


def get_client() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_KEY)


# ── Q1: โหลด active model ทุกจังหวัด ─────────────────────────────────
def load_active_models(sb: Client) -> dict:
    """
    return: {
      province_id: {
        model_name, model_params, mae
      }
    }
    ถ้าจังหวัดมีทั้ง stacking-v1 และ lightgbm-v1 active
    → เลือก stacking-v1 ก่อนเสมอ (MAE ดีกว่า)
    """
    resp = sb.table("model_registry") \
        .select("province_id,model_name,model_params,mae") \
        .eq("is_active", True) \
        .execute()

    result: dict = {}
    for r in (resp.data or []):
        pid  = r["province_id"]
        name = r["model_name"]
        # stacking-v1 มีความสำคัญสูงสุด — override ถ้ามีทั้งคู่
        if pid not in result or name == STACKING_MODEL:
            result[pid] = r
    return result


# ── Q2: โหลด base model feature_importance สำหรับ stacking ──────────
def load_base_models(sb: Client, base_names: set) -> dict:
    """
    ดึง feature_importance ของ base model (xgboost-v1 / lightgbm-v1)
    สำหรับจังหวัดที่ใช้ stacking-v1 เท่านั้น

    return: {
      (province_id, model_name): { feature_importance }
    }
    """
    if not base_names:
        return {}

    resp = sb.table("model_registry") \
        .select("province_id,model_name,model_params") \
        .in_("model_name", list(base_names)) \
        .execute()

    result: dict = {}
    for r in (resp.data or []):
        key    = (r["province_id"], r["model_name"])
        params = r.get("model_params") or {}
        result[key] = params.get("feature_importance", {})
    return result


# ── Q3: โหลด daily_summary 14 วันล่าสุด ─────────────────────────────
def load_recent_features(sb: Client) -> dict:
    """
    return: { province_id: [rows sorted by date asc] }

    Query เดียวครอบทุกจังหวัด (20 จังหวัด × ≤15 วัน ≈ 300 แถว) —
    การ query แยกรายจังหวัดทำให้ cold start เกิน 10 วิ และโดน 504.
    """
    cutoff = (date.today() - timedelta(days=14)).isoformat()

    resp = sb.table("daily_summary") \
        .select(
            "province_id,date,pm25_mean,"
            "pm25_lag_1d,pm25_lag_3d,pm25_lag_7d,pm25_roll7,"
            "neighbor_pm25_avg,regional_pm25_avg,"
            "temp_mean,humidity_mean,wind_speed_mean,precip_total,"
            "hotspot_count,total_frp,month,day_of_week,"
            "is_burning_season,is_dry_season"
        ) \
        .in_("province_id", PROVINCE_IDS) \
        .gte("date", cutoff) \
        .order("province_id") \
        .order("date") \
        .limit(20 * len(PROVINCE_IDS)) \
        .execute()

    by_province: dict = {}
    for row in (resp.data or []):
        by_province.setdefault(row["province_id"], []).append(row)

    return by_province


# ── Helper ────────────────────────────────────────────────────────────
def _fval(row: dict, col: str, default: float = 0.0) -> float:
    v = row.get(col)
    if v is None:
        return default
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


# ── Inference: ML weighted forecast ──────────────────────────────────
def ml_weighted_forecast(
    last_row: dict,
    feature_imp: dict,
    rolling: list,
    target_date: date,
) -> float:
    """
    Linear approximation จาก feature_importance:
      raw = Σ (norm_weight_i × feature_value_i)
    blend กับ lag1 เป็น anchor เพื่อ rescale ให้อยู่ในช่วงจริง
    """
    total_imp = sum(feature_imp.values()) or 1.0
    norm_w    = {k: v / total_imp for k, v in feature_imp.items()}

    lag1 = rolling[-1] if len(rolling) >= 1 else _fval(last_row, "pm25_mean", 20.0)
    lag3 = rolling[-3] if len(rolling) >= 3 else lag1
    lag7 = rolling[-7] if len(rolling) >= 7 else lag1

    fvec = {
        "pm25_lag_1d":       lag1,
        "pm25_lag_3d":       lag3,
        "pm25_lag_7d":       lag7,
        "pm25_roll7":        float(np.mean(rolling[-7:])) if len(rolling) >= 7 else lag1,
        "neighbor_pm25_avg": _fval(last_row, "neighbor_pm25_avg", lag1),
        "regional_pm25_avg": _fval(last_row, "regional_pm25_avg", lag1),
        "temp_mean":         _fval(last_row, "temp_mean", 28.0),
        "humidity_mean":     _fval(last_row, "humidity_mean", 70.0),
        "wind_speed_mean":   _fval(last_row, "wind_speed_mean", 2.0),
        "precip_total":      _fval(last_row, "precip_total", 0.0),
        "hotspot_count":     _fval(last_row, "hotspot_count", 0.0),
        "total_frp":         _fval(last_row, "total_frp", 0.0),
        "month":             float(target_date.month),
        "day_of_week":       float(target_date.weekday()),
        "is_burning_season": 1.0 if target_date.month in (1, 2, 3, 4) else 0.0,
        "is_dry_season":     1.0 if target_date.month in (11, 12, 1, 2, 3, 4) else 0.0,
    }

    raw      = sum(norm_w.get(col, 0.0) * fvec.get(col, 0.0) for col in FEATURE_COLS)
    anchor   = lag1
    rescaled = raw * anchor / max(abs(raw), 1e-6)
    blended  = 0.6 * rescaled + 0.4 * anchor
    return float(np.clip(blended, 1.0, 500.0))


# ── Inference: persist-revert-v2 ─────────────────────────────────────
def persist_revert_forecast(rolling: list, roll7_val: float, h: int) -> float:
    """
    persist-revert-v2 formula:
      ŷ_h = last + (1 - 0.85^h) × (roll7 - last)
    """
    last = rolling[-1] if rolling else 20.0
    return float(np.clip(
        last + (1 - 0.85 ** h) * (roll7_val - last),
        1.0, 500.0
    ))


# ── Main forecast logic ───────────────────────────────────────────────
def make_forecasts(sb: Client, horizon: int = 7) -> list:
    # Q1: active model ต่อจังหวัด
    active_models = load_active_models(sb)

    # หาว่าจังหวัดไหนใช้ stacking-v1 บ้าง → ต้องดึง base model แยก
    stacking_pids  = {
        pid for pid, row in active_models.items()
        if row["model_name"] == STACKING_MODEL
    }
    # รวม base model names ที่ต้องการ (อาจเป็น lightgbm-v1 หรือ xgboost-v1)
    needed_base_names: set = set()
    for pid in stacking_pids:
        params    = active_models[pid].get("model_params") or {}
        base_name = params.get("base_model", "lightgbm-v1")
        needed_base_names.add(base_name)

    # Q2: base model feature_importance (เฉพาะจังหวัดที่ใช้ stacking)
    base_models = load_base_models(sb, needed_base_names) if stacking_pids else {}

    # Q3: daily_summary features
    features = load_recent_features(sb)

    forecast_at = datetime.now(timezone.utc).isoformat()
    today       = date.today()
    rows_out    = []

    for pid in PROVINCE_IDS:
        model_row = active_models.get(pid)
        hist      = features.get(pid, [])
        if not model_row or not hist:
            continue

        model_name = model_row["model_name"]
        params     = model_row.get("model_params") or {}
        last_row   = hist[-1]
        rolling    = [float(r.get("pm25_mean") or 0) for r in hist]
        roll7_now  = float(np.mean(rolling[-7:])) if len(rolling) >= 7 else rolling[-1]

        for h in range(1, horizon + 1):
            target_date = today + timedelta(days=h)

            # ── stacking-v1: combine persist + base ML ───────────────
            if model_name == STACKING_MODEL:
                w_persist  = float(params.get("w_persist", 0.3))
                w_ml       = float(params.get("w_ml", 0.7))
                base_name  = params.get("base_model", "lightgbm-v1")

                # persist-revert-v2 component
                y_persist = persist_revert_forecast(rolling, roll7_now, h)

                # ML component — ดึง feature_importance จาก base model
                feature_imp = base_models.get((pid, base_name), {})
                y_ml = ml_weighted_forecast(last_row, feature_imp, rolling, target_date) \
                       if feature_imp else y_persist  # fallback ถ้าหา base model ไม่เจอ

                pm25_pred = w_persist * y_persist + w_ml * y_ml

            # ── xgboost-v1 / lightgbm-v1: feature importance โดยตรง ──
            elif model_name in BASE_ML_MODELS:
                feature_imp = params.get("feature_importance", {})
                pm25_pred   = ml_weighted_forecast(last_row, feature_imp, rolling, target_date)

            # ── fallback: persist-revert-v2 ──────────────────────────
            else:
                pm25_pred = persist_revert_forecast(rolling, roll7_now, h)

            pm25_pred = float(np.clip(pm25_pred, 1.0, 500.0))
            rows_out.append({
                "province_id":        pid,
                "forecast_at":        forecast_at,
                "target_date":        target_date.isoformat(),
                "pm25_mean_forecast": round(pm25_pred, 2),
                "pm25_max_forecast":  round(pm25_pred * 1.35, 2),
                "model_name":         model_name,
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
            "models":   ["stacking-v1", "lightgbm-v1", "xgboost-v1"],
        })

    def do_POST(self):
        if not _authorized(dict(self.headers)):
            return self._send(401, {"error": "Unauthorized"})
        if not SUPABASE_URL or not SUPABASE_KEY:
            return self._send(500, {"error": "Supabase env vars not set"})

        length  = int(self.headers.get("Content-Length", 0))
        body    = json.loads(self.rfile.read(length)) if length else {}
        horizon = int(body.get("horizon", 7))

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
