"""Typed configuration for the dual regression/classification pipeline."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

FEATURE_VERSION = "daily-observed-v3"
FEATURE_COLUMNS = (
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
)
MODEL_FAMILIES = (
    "random_forest",
    "adaboost",
    "gradient_boosting",
    "xgboost",
    "lightgbm",
    "catboost",
)
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
    regression_minimum_skill: float = 0.05
    classifier_minimum_macro_f1: float = 0.30
    classifier_minimum_critical_recall: float = 0.50
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
    forecast_horizon_days: int = 7
    random_seed: int = 42
    serving_policy: str = "classifier_with_regression_fallback"
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
        if self.serving_policy not in SERVING_POLICIES:
            raise ValueError(f"unsupported serving policy: {self.serving_policy}")
        unsupported = set(self.allowed_model_families) - set(MODEL_FAMILIES)
        if unsupported or not self.allowed_model_families:
            raise ValueError(f"unsupported or empty model family set: {sorted(unsupported)}")
