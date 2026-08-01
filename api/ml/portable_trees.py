"""Portable tree artifacts shared by offline training and Vercel inference.

The exporters preserve the fitted LightGBM and Random Forest tree structures;
the evaluators execute those exact structures without replacing them with a
linear surrogate.  Artifacts are JSON and can be gzip-compressed for private
Supabase Storage.
"""

from __future__ import annotations

import gzip
import json
import math
from typing import Iterable

import numpy as np

ARTIFACT_SCHEMA = "portable-tree-ensemble-v1"


def encode_artifact(artifact: dict) -> bytes:
    payload = json.dumps(
        artifact,
        allow_nan=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return gzip.compress(payload, compresslevel=9, mtime=0)


def decode_artifact(payload: bytes) -> dict:
    try:
        decoded = gzip.decompress(payload)
    except (gzip.BadGzipFile, OSError):
        decoded = payload
    artifact = json.loads(decoded.decode("utf-8"))
    if not isinstance(artifact, dict) or artifact.get("artifact_schema") != ARTIFACT_SCHEMA:
        raise ValueError("unsupported portable tree artifact schema")
    return artifact


def export_lightgbm_regressor(
    model: object,
    feature_cols: Iterable[str],
    *,
    feature_version: str,
) -> dict:
    booster = model.booster_
    dump = booster.dump_model()
    trees = [item["tree_structure"] for item in dump.get("tree_info", [])]
    if not trees:
        raise ValueError("LightGBM model has no trees")
    return {
        "artifact_schema": ARTIFACT_SCHEMA,
        "task_type": "regression",
        "model_family": "lightgbm",
        "feature_version": feature_version,
        "feature_cols": list(feature_cols),
        "objective": dump.get("objective", "regression"),
        "num_trees": len(trees),
        "trees": trees,
    }


def export_random_forest_classifier(
    model: object,
    feature_cols: Iterable[str],
    *,
    feature_version: str,
    threshold_version: str,
    temperature: float = 1.0,
) -> dict:
    if not math.isfinite(temperature) or temperature <= 0:
        raise ValueError("classifier temperature must be positive")
    trees = []
    for estimator in model.estimators_:
        tree = estimator.tree_
        values = np.asarray(tree.value, dtype=float)
        if values.ndim != 3 or values.shape[1] != 1:
            raise ValueError("unsupported Random Forest tree value shape")
        trees.append({
            "children_left": tree.children_left.astype(int).tolist(),
            "children_right": tree.children_right.astype(int).tolist(),
            "features": tree.feature.astype(int).tolist(),
            "thresholds": tree.threshold.astype(float).tolist(),
            "values": values[:, 0, :].astype(float).tolist(),
        })
    if not trees:
        raise ValueError("Random Forest model has no trees")
    return {
        "artifact_schema": ARTIFACT_SCHEMA,
        "task_type": "classification",
        "model_family": "random_forest",
        "feature_version": feature_version,
        "feature_cols": list(feature_cols),
        "threshold_version": threshold_version,
        "classes": [int(value) for value in np.asarray(model.classes_).tolist()],
        "temperature": float(temperature),
        "num_trees": len(trees),
        "trees": trees,
    }


def _validate_features(features: np.ndarray, artifact: dict) -> np.ndarray:
    vector = np.asarray(features, dtype=float)
    cols = artifact.get("feature_cols") or []
    if vector.ndim != 1 or len(vector) != len(cols) or not len(cols):
        raise ValueError("portable tree feature schema mismatch")
    if not np.all(np.isfinite(vector)):
        raise ValueError("portable tree features contain non-finite values")
    return vector


def _lightgbm_tree_value(node: dict, features: np.ndarray) -> float:
    while "leaf_value" not in node:
        feature_index = int(node["split_feature"])
        threshold = float(node["threshold"])
        value = float(features[feature_index])
        decision_type = str(node.get("decision_type", "<="))
        if math.isnan(value):
            go_left = bool(node.get("default_left", True))
        elif decision_type == "<=":
            go_left = value <= threshold
        else:
            raise ValueError(f"unsupported LightGBM decision type: {decision_type}")
        node = node["left_child"] if go_left else node["right_child"]
    return float(node["leaf_value"])


def evaluate_lightgbm_regressor(features: np.ndarray, artifact: dict) -> float:
    if artifact.get("model_family") != "lightgbm" or artifact.get("task_type") != "regression":
        raise ValueError("artifact is not a LightGBM regressor")
    vector = _validate_features(features, artifact)
    prediction = sum(
        _lightgbm_tree_value(tree, vector)
        for tree in artifact.get("trees") or []
    )
    if not math.isfinite(prediction):
        raise ValueError("LightGBM artifact returned a non-finite prediction")
    return float(prediction)


def _rf_leaf_probabilities(tree: dict, features: np.ndarray) -> np.ndarray:
    left = tree["children_left"]
    right = tree["children_right"]
    feature_indices = tree["features"]
    thresholds = tree["thresholds"]
    node = 0
    while int(left[node]) != int(right[node]):
        feature_index = int(feature_indices[node])
        node = int(left[node]) if features[feature_index] <= float(thresholds[node]) else int(right[node])
    values = np.asarray(tree["values"][node], dtype=float)
    total = float(values.sum())
    if total <= 0 or not np.all(np.isfinite(values)):
        raise ValueError("Random Forest leaf has invalid class weights")
    return values / total


def evaluate_random_forest_classifier(
    features: np.ndarray,
    artifact: dict,
    *,
    class_ids: Iterable[int] = (1, 2, 3, 4, 5),
) -> dict[str, float]:
    if artifact.get("model_family") != "random_forest" or artifact.get("task_type") != "classification":
        raise ValueError("artifact is not a Random Forest classifier")
    vector = _validate_features(features, artifact)
    trees = artifact.get("trees") or []
    if not trees:
        raise ValueError("Random Forest artifact has no trees")
    compact = np.mean(
        np.vstack([_rf_leaf_probabilities(tree, vector) for tree in trees]),
        axis=0,
    )
    public_ids = [int(value) for value in class_ids]
    model_classes = [int(value) for value in artifact.get("classes") or []]
    if len(model_classes) != len(compact):
        raise ValueError("Random Forest artifact class schema mismatch")

    public_index = {
        class_id: index for index, class_id in enumerate(public_ids)
    }
    aligned = np.zeros(len(public_ids), dtype=float)
    for index, class_id in enumerate(model_classes):
        if class_id in public_index:
            aligned[public_index[class_id]] = compact[index]
    total = float(aligned.sum())
    if total <= 0:
        raise ValueError("Random Forest artifact has no supported classes")
    aligned /= total

    # Match the native evaluation contract: align to all five public classes
    # before calibration. Missing rare classes therefore receive the same
    # clipped log-probability on both sides of the parity check.
    temperature = float(artifact.get("temperature", 1.0))
    if not math.isfinite(temperature) or temperature <= 0:
        raise ValueError("invalid Random Forest calibration temperature")
    if temperature != 1.0:
        logits = np.log(np.clip(aligned, 1e-12, 1.0)) / temperature
        logits -= np.max(logits)
        aligned = np.exp(logits)
        aligned /= aligned.sum()

    return {
        str(class_id): float(aligned[index])
        for index, class_id in enumerate(public_ids)
    }


def evaluate_tree_artifact(features: np.ndarray, artifact: dict):
    family = artifact.get("model_family")
    task_type = artifact.get("task_type")
    if family == "lightgbm" and task_type == "regression":
        return evaluate_lightgbm_regressor(features, artifact)
    if family == "random_forest" and task_type == "classification":
        return evaluate_random_forest_classifier(features, artifact)
    raise ValueError("unsupported portable tree family/task combination")
