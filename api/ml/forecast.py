"""
Vercel Python Serverless Function — PM2.5 7-day forecast inference.

    POST /api/ml/forecast
    Authorization: Bearer <ML_SECRET>

WHY THIS EXISTS
───────────────
The real model is a gradient-boosted ensemble (XGBoost + LightGBM) that is far
too heavy to import inside a Vercel function and still cold-start under the 10s
limit. So we split the work:

  • Offline (Colab, training/train_xgb_lgbm.ipynb):
        train XGB + LGBM → distil into a per-province LINEAR SURROGATE
        (coef + intercept) → persist to model_registry.model_params, together
        with feature_importance for the dashboard.

  • Online (this file):
        load the surrogate from model_registry, pull recent daily_summary
        rows from Supabase REST, evaluate the surrogate iteratively for 7 days,
        expand to 168 hourly points, and upsert into forecast_hourly /
        forecast_daily.

IMPORTANT: if model_registry has no active rows with a usable model_params
(i.e. the Colab notebook has not been run yet), there is nothing to evaluate
and the endpoint returns {"rows": 0}. Run the notebook first.
"""

from __future__ import annotations

import json
import math
import os
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler

import numpy as np
import requests

MODEL_NAME = os.environ.get("ML_MODEL_NAME", "xgb-lgbm-ensemble-v1")
HORIZON_DAYS = 7
HORIZON_HOURS = HORIZON_DAYS * 24
LOOKBACK_DAYS = 21
PM25_FLOOR = 1.0
REQUEST_TIMEOUT = 6  # seconds — leave headroom under Vercel's 10s ceiling

# Feature order MUST match what the notebook writes into model_params.coef.
DEFAULT_FEATURES = [
    "lag1", "lag7", "roll7", "roll14",
    "doy_sin", "doy_cos",
    "hotspot", "burning", "temp", "humidity", "wind",
]
# Neutral diurnal shape (sums-to-mean ~ 1.0) used only if the notebook didn't
# persist one. Higher overnight/early-morning, lower midday.
DEFAULT_DIURNAL = [
    1.10, 1.12, 1.13, 1.14, 1.14, 1.13, 1.15, 1.16, 1.10, 1.00, 0.92, 0.86,
    0.83, 0.82, 0.83, 0.86, 0.90, 0.95, 1.00, 1.05, 1.08, 1.09, 1.09, 1.10,
]


# ── Supabase REST helpers ────────────────────────────────────────────────────

def _supabase_env() -> tuple[str, str]:
    url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY")
    if not url or not key:
        raise RuntimeError("Supabase env not configured (SUPABASE_URL / service role key)")
    return url.rstrip("/"), key


def _headers(key: str, write: bool = False) -> dict[str, str]:
    h = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    if write:
        # Upsert semantics — merge on the table's conflict target.
        h["Prefer"] = "resolution=merge-duplicates,return=minimal"
    return h


def _rest_get(url: str, key: str, path: str, params: dict) -> list[dict]:
    r = requests.get(
        f"{url}/rest/v1/{path}", headers=_headers(key), params=params, timeout=REQUEST_TIMEOUT
    )
    r.raise_for_status()
    return r.json()


def _rest_upsert(url: str, key: str, path: str, rows: list[dict], on_conflict: str) -> None:
    if not rows:
        return
    r = requests.post(
        f"{url}/rest/v1/{path}",
        headers=_headers(key, write=True),
        params={"on_conflict": on_conflict},
        data=json.dumps(rows),
        timeout=REQUEST_TIMEOUT,
    )
    r.raise_for_status()


# ── Model loading ────────────────────────────────────────────────────────────

def _load_models(url: str, key: str) -> dict[str, dict]:
    """province_id → model_params for the active rows of MODEL_NAME.

    Rows whose model_params lacks a `coef` array are skipped — they carry no
    usable surrogate (e.g. metrics-only rows), so they cannot drive inference.
    """
    rows = _rest_get(
        url, key, "model_registry",
        {
            "select": "province_id,model_params",
            "model_name": f"eq.{MODEL_NAME}",
            "is_active": "is.true",
        },
    )
    models: dict[str, dict] = {}
    for r in rows:
        params = r.get("model_params")
        pid = r.get("province_id")
        if not pid or not isinstance(params, dict):
            continue
        if not params.get("coef"):
            continue
        models[pid] = params
    return models


# ── Feature engineering + inference ──────────────────────────────────────────

def _num(v, default=0.0) -> float:
    try:
        return float(v) if v is not None else default
    except (TypeError, ValueError):
        return default


def _build_history(rows: list[dict]) -> dict:
    """rows come newest-first from REST; flip to oldest-first series."""
    rows = list(reversed(rows))
    return {
        "pm25": [_num(r.get("pm25_mean")) for r in rows],
        "hotspot": [_num(r.get("hotspot_count")) for r in rows],
        "burning": [1.0 if r.get("is_burning_season") else 0.0 for r in rows],
        "temp": [_num(r.get("temp_mean"), 28.0) for r in rows],
        "humidity": [_num(r.get("humidity_mean"), 60.0) for r in rows],
        "wind": [_num(r.get("wind_speed_mean"), 5.0) for r in rows],
        "last_date": rows[-1].get("date") if rows else None,
    }


def _features(series: list[float], hist: dict, target: datetime, names: list[str]) -> np.ndarray:
    """Compute the feature vector for a single forecast day."""
    n = len(series)
    lag1 = series[-1] if n >= 1 else 0.0
    lag7 = series[-7] if n >= 7 else (series[0] if n else 0.0)
    roll7 = float(np.mean(series[-7:])) if n else 0.0
    roll14 = float(np.mean(series[-14:])) if n else 0.0
    doy = target.timetuple().tm_yday
    doy_sin = math.sin(2 * math.pi * doy / 365.25)
    doy_cos = math.cos(2 * math.pi * doy / 365.25)
    # Future weather/hotspot are unknown → persist last observed value.
    feat = {
        "lag1": lag1, "lag7": lag7, "roll7": roll7, "roll14": roll14,
        "doy_sin": doy_sin, "doy_cos": doy_cos,
        "hotspot": hist["hotspot"][-1] if hist["hotspot"] else 0.0,
        "burning": hist["burning"][-1] if hist["burning"] else 0.0,
        "temp": hist["temp"][-1] if hist["temp"] else 28.0,
        "humidity": hist["humidity"][-1] if hist["humidity"] else 60.0,
        "wind": hist["wind"][-1] if hist["wind"] else 5.0,
    }
    return np.array([feat.get(name, 0.0) for name in names], dtype=float)


def _forecast_province(params: dict, hist: dict, generated_at: datetime):
    names = params.get("features", DEFAULT_FEATURES)
    coef = np.array(params.get("coef", []), dtype=float)
    intercept = _num(params.get("intercept"), 0.0)
    floor = _num(params.get("pm25_floor"), PM25_FLOOR)
    diurnal = params.get("diurnal", DEFAULT_DIURNAL)
    if len(coef) != len(names):
        return [], []

    series = list(hist["pm25"])
    daily: list[tuple[str, float, float]] = []
    base_date = generated_at.date()
    for d in range(1, HORIZON_DAYS + 1):
        target = datetime.combine(base_date, datetime.min.time(), tzinfo=timezone.utc) + timedelta(days=d)
        x = _features(series, hist, target, names)
        pred = float(intercept + np.dot(coef, x))
        pred = max(floor, pred)
        series.append(pred)  # feed prediction forward for the next lag
        day_max = pred * max(diurnal)
        daily.append((target.date().isoformat(), round(pred, 1), round(day_max, 1)))

    # Expand each day into 24 hourly points via the diurnal shape.
    hourly: list[tuple[str, float]] = []
    for d in range(HORIZON_DAYS):
        day_mean = daily[d][1]
        for h in range(24):
            ts = (
                datetime.combine(base_date, datetime.min.time(), tzinfo=timezone.utc)
                + timedelta(days=d + 1, hours=h)
            )
            val = max(floor, day_mean * diurnal[h % 24])
            hourly.append((ts.isoformat().replace("+00:00", "Z"), round(val, 1)))
    return daily, hourly


# ── Main run ─────────────────────────────────────────────────────────────────

def run_forecast() -> dict:
    url, key = _supabase_env()
    models = _load_models(url, key)
    if not models:
        return {
            "ok": True, "model": MODEL_NAME, "provinces": 0, "rows": 0,
            "message": "No active model_registry rows with feature_importance — run the Colab notebook first.",
        }

    generated_at = datetime.now(timezone.utc)
    forecast_at = generated_at.isoformat().replace("+00:00", "Z")
    hourly_rows: list[dict] = []
    daily_rows: list[dict] = []
    used = 0

    for pid, params in models.items():
        rows = _rest_get(
            url, key, "daily_summary",
            {
                "select": "date,pm25_mean,hotspot_count,is_burning_season,temp_mean,humidity_mean,wind_speed_mean",
                "province_id": f"eq.{pid}",
                "order": "date.desc",
                "limit": str(LOOKBACK_DAYS),
            },
        )
        hist = _build_history([r for r in rows if r.get("pm25_mean") is not None])
        if not hist["pm25"]:
            continue
        daily, hourly = _forecast_province(params, hist, generated_at)
        if not daily:
            continue
        used += 1
        for date_iso, mean_v, max_v in daily:
            daily_rows.append({
                "province_id": pid, "forecast_at": forecast_at, "target_date": date_iso,
                "pm25_mean_forecast": mean_v, "pm25_max_forecast": max_v, "model_name": MODEL_NAME,
            })
        for ts, val in hourly:
            hourly_rows.append({
                "province_id": pid, "forecast_at": forecast_at, "target_time": ts,
                "pm25_forecast": val, "model_name": MODEL_NAME,
            })

    _rest_upsert(url, key, "forecast_daily", daily_rows,
                 "province_id,forecast_at,target_date,model_name")
    _rest_upsert(url, key, "forecast_hourly", hourly_rows,
                 "province_id,forecast_at,target_time,model_name")

    return {
        "ok": True, "model": MODEL_NAME, "provinces": used,
        "rows": len(hourly_rows) + len(daily_rows),
        "generatedAt": forecast_at,
    }


# ── HTTP handler (Vercel Python runtime) ─────────────────────────────────────

class handler(BaseHTTPRequestHandler):
    def _authorized(self) -> bool:
        secret = os.environ.get("ML_SECRET")
        if not secret:
            return True  # no secret configured → allow (dev parity with CRON_SECRET)
        return self.headers.get("Authorization") == f"Bearer {secret}"

    def _send(self, status: int, body: dict) -> None:
        payload = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _handle(self) -> None:
        if not self._authorized():
            self._send(401, {"ok": False, "error": "Unauthorized"})
            return
        try:
            self._send(200, run_forecast())
        except requests.HTTPError as e:  # surface Supabase REST errors clearly
            self._send(502, {"ok": False, "error": f"Supabase REST error: {e}"})
        except Exception as e:  # noqa: BLE001 — endpoint must always answer JSON
            self._send(500, {"ok": False, "error": str(e)})

    def do_POST(self) -> None:  # noqa: N802 — required name for the runtime
        self._handle()

    def do_GET(self) -> None:  # noqa: N802 — allow manual smoke tests
        self._handle()
