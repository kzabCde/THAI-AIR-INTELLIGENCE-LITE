import importlib.util
from datetime import date
from pathlib import Path

spec = importlib.util.spec_from_file_location("ml_forecast", Path("api/ml/forecast.py"))
ml = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ml)


def test_standardized_surrogate_uses_scaler_and_coefficients():
    params = {
        "feature_order": ml.FEATURE_COLS,
        "coef": [2.0] + [0.0] * (len(ml.FEATURE_COLS) - 1),
        "intercept": 10.0,
        "scaler_mean": [5.0] + [0.0] * (len(ml.FEATURE_COLS) - 1),
        "scaler_scale": [5.0] + [1.0] * (len(ml.FEATURE_COLS) - 1),
        "residual_p90": 3.5,
    }
    pred, p90 = ml.surrogate_forecast(params, [15.0] + [0.0] * (len(ml.FEATURE_COLS) - 1))
    assert pred == 14.0
    assert p90 == 3.5


def test_persistence_baseline_uses_current_day_pm25_mean():
    rolling = [10.0, 20.0, 40.0]
    assert ml.persist_revert_forecast(rolling, 30.0, 1) == 38.5


def test_duplicate_active_model_loader_keeps_one_latest_per_province():
    class Query:
        def select(self, *_args): return self
        def eq(self, *_args): return self
        def order(self, *_args, **_kwargs): return self
        def execute(self):
            return type("Resp", (), {"data": [
                {"province_id": "TH-30", "model_name": "new", "trained_at": "2026-01-02", "model_params": {}, "mae": 1},
                {"province_id": "TH-30", "model_name": "old", "trained_at": "2026-01-01", "model_params": {}, "mae": 2},
            ]})()
    class SB:
        def table(self, name):
            assert name == "model_registry"
            return Query()
    active = ml.load_active_models(SB())
    assert list(active) == ["TH-30"]
    assert active["TH-30"]["model_name"] == "new"


def test_forecast_origin_uses_latest_data_date_not_runtime_today():
    row = {"date": "2026-02-01", "pm25_mean": 25, "temp_mean": 30, "humidity_mean": 60}
    fvec = ml.build_feature_vector(row, [20, 25], date.fromisoformat(row["date"]) + ml.timedelta(days=1))
    assert fvec[ml.FEATURE_COLS.index("month")] == 2
    assert fvec[ml.FEATURE_COLS.index("day_of_week")] == 0  # 2026-02-02 Monday
