"""Shared PM2.5 class definitions for training and Python inference."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Iterable

import numpy as np

THRESHOLD_VERSION = "thai-pm25-5class-v1"
CLASS_IDS = (1, 2, 3, 4, 5)


@dataclass(frozen=True)
class PM25Class:
    class_id: int
    max_pm25: float
    label_en: str
    label_th: str
    color: str
    health_message_th: str
    action_th: str


PM25_CLASSES = (
    PM25Class(
        1,
        15.0,
        "Very Good",
        "ดีมาก",
        "#16a34a",
        "คุณภาพอากาศดีมาก",
        "ทำกิจกรรมกลางแจ้งได้ตามปกติ",
    ),
    PM25Class(
        2,
        25.0,
        "Good",
        "ดี",
        "#84cc16",
        "คุณภาพอากาศดี",
        "ทำกิจกรรมกลางแจ้งได้ และติดตามค่าฝุ่นตามปกติ",
    ),
    PM25Class(
        3,
        37.5,
        "Moderate",
        "ปานกลาง",
        "#eab308",
        "คุณภาพอากาศปานกลาง",
        "กลุ่มเสี่ยงควรสังเกตอาการเมื่อทำกิจกรรมกลางแจ้ง",
    ),
    PM25Class(
        4,
        75.0,
        "Increased Health Risk",
        "เริ่มมีผลกระทบต่อสุขภาพ",
        "#f97316",
        "เริ่มมีความเสี่ยงต่อสุขภาพ",
        "ลดกิจกรรมกลางแจ้ง โดยเฉพาะเด็ก ผู้สูงอายุ และผู้มีโรคประจำตัว",
    ),
    PM25Class(
        5,
        float("inf"),
        "Serious Health Effects",
        "มีผลกระทบต่อสุขภาพอย่างรุนแรง",
        "#dc2626",
        "มีผลกระทบต่อสุขภาพอย่างรุนแรง",
        "หลีกเลี่ยงกิจกรรมกลางแจ้งและติดตามคำแนะนำจากหน่วยงานสาธารณสุข",
    ),
)


def class_for_pm25(value: float) -> int:
    """Map a non-negative PM2.5 value to the configured class."""
    parsed = float(value)
    if not np.isfinite(parsed) or parsed < 0:
        raise ValueError("PM2.5 must be a finite non-negative number")
    for definition in PM25_CLASSES:
        if parsed <= definition.max_pm25:
            return definition.class_id
    raise AssertionError("unreachable PM2.5 class")


def classes_for_pm25(values: Iterable[float]) -> np.ndarray:
    return np.asarray([class_for_pm25(value) for value in values], dtype=np.int64)


def class_definition(class_id: int) -> PM25Class:
    if class_id not in CLASS_IDS:
        raise ValueError(f"class_id must be one of {CLASS_IDS}")
    return PM25_CLASSES[class_id - 1]


def class_mapping() -> dict[str, dict]:
    """JSON-safe mapping stored with every classification artifact."""
    result: dict[str, dict] = {}
    for definition in PM25_CLASSES:
        item = asdict(definition)
        item["max_pm25"] = None if not np.isfinite(definition.max_pm25) else definition.max_pm25
        result[str(definition.class_id)] = item
    return result


def normalize_probabilities(
    probabilities: Iterable[float],
    *,
    tolerance: float = 1e-6,
) -> list[float]:
    values = np.asarray(list(probabilities), dtype=float)
    if values.shape != (len(CLASS_IDS),):
        raise ValueError("probabilities must contain exactly five values")
    if not np.all(np.isfinite(values)) or np.any(values < 0):
        raise ValueError("probabilities must be finite and non-negative")
    total = float(values.sum())
    if total <= tolerance:
        raise ValueError("probabilities must have a positive sum")
    normalized = values / total
    if abs(float(normalized.sum()) - 1.0) > tolerance:
        raise ValueError("probabilities must sum to one")
    return normalized.astype(float).tolist()
