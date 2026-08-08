"""Typed configuration for the dual regression/classification pipeline."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

FEATURE_VERSION = "daily-observed-v4"
FEATURE_COLUMNS = (
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
)
DERIVED_FEATURE_COLUMNS = (
    "pm25_lag_6d",
    "day_of_year_sin",
    "day_of_year_cos",
)
SOURCE_FEATURE_COLUMNS = tuple(
    column for column in FEATURE_COLUMNS if column not in DERIVED_FEATURE_COLUMNS
)
FEATURE_PROVENANCE = {
    "pm25": "trusted non-synthetic air_quality_hourly observations",
    "weather": "weather_hourly observations joined into daily_summary",
    "spatial": "daily_summary province-neighbour and regional aggregates",
    "calendar": "derived deterministically from the Bangkok business date",
    "excluded_until_backfilled": (
        "hotspot_count",
        "total_frp",
    ),
}
MODEL_FAMILIES = (
    "random_forest",
    "lightgbm",
)

# Production v5.6.2 uses province-local residual regression and pooled
# classification over this shared feature contract. Province identity remains
# one-hot encoded instead of treating the ISO code as an ordinal number.
POOLED_FEATURE_VERSION = "daily-pooled-v1"
POOLED_REGRESSION_FAMILY = "lightgbm"
POOLED_CLASSIFICATION_FAMILY = "random_forest"
POOLED_VALIDATION_DAYS = 365
POOLED_TEST_DAYS = 365
POOLED_EMBARGO_DAYS = 7
POOLED_MINIMUM_TRAINING_DAYS = 90
POOLED_MINIMUM_ORIGIN_DAYS = (
    POOLED_MINIMUM_TRAINING_DAYS
    + POOLED_VALIDATION_DAYS
    + POOLED_TEST_DAYS
    + 2 * POOLED_EMBARGO_DAYS
)
FALLBACK_MODEL_NAME = "recent-mean-v1"
FALLBACK_STRATEGY = "recent_observed_mean"
FALLBACK_WINDOW_DAYS = 7
POOLED_PROVINCE_IDS = tuple(f"TH-{code}" for code in range(30, 50))
POOLED_PROVINCE_COLUMNS = tuple(
    f"province_{province_id.replace('-', '_')}"
    for province_id in POOLED_PROVINCE_IDS
)
POOLED_FEATURE_COLUMNS = (
    *FEATURE_COLUMNS,
    "province_latitude",
    "province_longitude",
    "forecast_horizon_days",
    *POOLED_PROVINCE_COLUMNS,
)
POOLED_FEATURE_PROVENANCE = {
    **FEATURE_PROVENANCE,
    "province": "isan_provinces coordinates plus deterministic one-hot identity",
    "forecast_horizon": "integer direct horizon from 1 through 7 days",
    "pooling": "all selected provinces share one leakage-safe chronological model",
}
SERVING_POLICIES = (
    "direct_classifier",
    "regression_threshold",
    "classifier_with_regression_fallback",
)


@dataclass(frozen=True)
class PipelineConfig:
    minimum_rows: int = 180
    minimum_validation_rows: int = 30
    minimum_test_rows: int = 30
    validation_fraction: float = 0.20
    test_fraction: float = 0.20
    cv_splits: int = 5
    regression_minimum_skill: float = 0.045
    classifier_minimum_macro_f1: float = 0.30
    classifier_minimum_critical_recall: float = 0.35
    critical_class_minimum_support: int = 5
    maximum_train_test_gap: float = 0.25
    regression_surrogate_alphas: tuple[float, ...] = (
        0.01, 0.1, 1.0, 10.0, 100.0, 1_000.0,
    )
    regression_blend_weights: tuple[float, ...] = (
        0.1, 0.25, 0.5, 0.75, 1.0,
    )
    classifier_regularization_c: tuple[float, ...] = (
        0.001, 0.01, 0.1, 1.0,
    )
    classifier_weight_powers: tuple[float, ...] = (
        0.0, 0.25, 0.5, 0.75, 1.0,
    )
    classifier_blend_weights: tuple[float, ...] = (
        0.25, 0.5, 0.75, 1.0,
    )
    classifier_temperatures: tuple[float, ...] = (
        0.75, 1.0, 1.25,
    )
    forecast_horizon_days: int = 7
    random_seed: int = 42
    serving_policy: str = "classifier_with_regression_fallback"
    fallback_strategy: str = FALLBACK_STRATEGY
    fallback_window_days: int = FALLBACK_WINDOW_DAYS
    artifact_directory: Path = Path("training/artifacts")
    allowed_model_families: tuple[str, ...] = MODEL_FAMILIES

    def validate(self) -> None:
        if self.minimum_rows < 100:
            raise ValueError("minimum_rows must be at least 100")
        if self.minimum_validation_rows < 1 or self.minimum_test_rows < 1:
            raise ValueError("validation and test minimums must be positive")
        if self.validation_fraction + self.test_fraction >= 0.5:
            raise ValueError("validation_fraction + test_fraction must be below 0.5")
        if not 2 <= self.cv_splits <= 5:
            raise ValueError("cv_splits must be between 2 and 5")
        if (
            not self.regression_surrogate_alphas
            or any(value <= 0 for value in self.regression_surrogate_alphas)
        ):
            raise ValueError("regression surrogate alphas must be positive")
        if (
            not self.regression_blend_weights
            or any(not 0 < value <= 1 for value in self.regression_blend_weights)
        ):
            raise ValueError("regression blend weights must be within (0, 1]")
        if (
            not self.classifier_regularization_c
            or any(value <= 0 for value in self.classifier_regularization_c)
        ):
            raise ValueError("classifier regularization values must be positive")
        if (
            not self.classifier_weight_powers
            or any(not 0 <= value <= 1 for value in self.classifier_weight_powers)
        ):
            raise ValueError("classifier weight powers must be within [0, 1]")
        if (
            not self.classifier_blend_weights
            or any(not 0 < value <= 1 for value in self.classifier_blend_weights)
        ):
            raise ValueError("classifier blend weights must be within (0, 1]")
        if (
            not self.classifier_temperatures
            or any(value <= 0 for value in self.classifier_temperatures)
        ):
            raise ValueError("classifier temperatures must be positive")
        if self.serving_policy not in SERVING_POLICIES:
            raise ValueError(f"unsupported serving policy: {self.serving_policy}")
        if self.fallback_strategy != FALLBACK_STRATEGY:
            raise ValueError(
                f"unsupported fallback strategy: {self.fallback_strategy}"
            )
        if self.fallback_window_days < 1:
            raise ValueError("fallback_window_days must be positive")
        unsupported = set(self.allowed_model_families) - set(MODEL_FAMILIES)
        if unsupported or not self.allowed_model_families:
            raise ValueError(f"unsupported or empty model family set: {sorted(unsupported)}")
