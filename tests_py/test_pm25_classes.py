import numpy as np
import pytest

from training.pm25_classes import (
    THRESHOLD_VERSION,
    class_for_pm25,
    classes_for_pm25,
    normalize_probabilities,
)


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (0, 1),
        (15, 1),
        (15.01, 2),
        (25, 2),
        (25.01, 3),
        (37.5, 3),
        (37.51, 4),
        (75, 4),
        (75.01, 5),
    ],
)
def test_pm25_threshold_boundaries(value, expected):
    assert class_for_pm25(value) == expected


def test_vectorized_class_mapping_uses_actual_values():
    assert classes_for_pm25([10, 20, 30, 50, 100]).tolist() == [1, 2, 3, 4, 5]


@pytest.mark.parametrize("value", [-1, np.nan, np.inf])
def test_invalid_pm25_is_rejected(value):
    with pytest.raises(ValueError):
        class_for_pm25(value)


def test_probabilities_are_normalized_and_versioned():
    probabilities = normalize_probabilities([1, 1, 2, 4, 2])
    assert sum(probabilities) == pytest.approx(1.0)
    assert THRESHOLD_VERSION == "thai-pm25-5class-v1"
