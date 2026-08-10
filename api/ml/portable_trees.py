"""Portable tree artifacts shared by offline training and Vercel inference.

The exporters preserve the fitted LightGBM and Random Forest tree structures;
the evaluators execute those exact structures without replacing them with a
linear surrogate. Artifacts are JSON and can be gzip-compressed for private
Supabase Storage. Large Free-plan serving artifacts may be represented by a
small gzip-compressed chunk manifest whose verified parts reconstruct the exact
original portable artifact before decoding.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import math
import os
from typing import Iterable
from urllib.parse import quote

import numpy as np

ARTIFACT_SCHEMA = "portable-tree-ensemble-v1"
CHUNK_MANIFEST_SCHEMA = "portable-tree-chunk-manifest-v1"
CHUNK_MANIFEST_MAX_PARTS = 32
CHUNK_MANIFEST_MAX_PAYLOAD_BYTES = 256 * 1024 * 1024


def encode_artifact(artifact: dict) -> bytes:
    payload = json.dumps(
        artifact,
        allow_nan=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return gzip.compress(payload, compresslevel=9, mtime=0)


def _decode_json_bytes(payload: bytes) -> dict:
    try:
        decoded = gzip.decompress(payload)
    except (gzip.BadGzipFile, OSError):
        decoded = payload
    value = json.loads(decoded.decode("utf-8"))
    if not isinstance(value, dict):
        raise ValueError("portable artifact payload must be a JSON object")
    return value


def _storage_location(uri: str) -> tuple[str, str]:
    prefix = "storage://"
    if not isinstance(uri, str) or not uri.startswith(prefix):
        raise ValueError("chunk manifest requires private storage URIs")
    location = uri[len(prefix):]
    bucket, separator, path = location.partition("/")
    if (
        not separator
        or not bucket
        or not path
        or ".." in path.split("/")
        or bucket != "model-artifacts"
    ):
        raise ValueError("invalid chunk manifest storage URI")
    return bucket, path


def _download_storage_object(uri: str) -> bytes:
    """Download one private chunk using service credentials already used by inference."""
    bucket, path = _storage_location(uri)
    supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not supabase_url or not service_key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required "
            "to resolve chunked runtime artifacts"
        )
    try:
        import requests
    except ImportError as exc:  # pragma: no cover - production requirements include requests
        raise RuntimeError("requests is required for chunked runtime artifacts") from exc

    encoded_bucket = quote(bucket, safe="")
    encoded_path = quote(path, safe="/")
    response = requests.get(
        f"{supabase_url}/storage/v1/object/authenticated/"
        f"{encoded_bucket}/{encoded_path}",
        headers={
            "Authorization": f"Bearer {service_key}",
            "apikey": service_key,
        },
        timeout=(15.0, 180.0),
    )
    try:
        response.raise_for_status()
        return bytes(response.content)
    finally:
        response.close()


def _resolve_chunk_manifest(manifest: dict) -> bytes:
    if manifest.get("artifact_schema") != CHUNK_MANIFEST_SCHEMA:
        raise ValueError("unsupported portable tree chunk manifest schema")
    payload_format = manifest.get("payload_format")
    if payload_format != "json+gzip":
        raise ValueError("unsupported chunk manifest payload format")

    expected_sha = str(manifest.get("payload_sha256") or "")
    expected_size = int(manifest.get("payload_byte_size") or 0)
    if len(expected_sha) != 64 or any(c not in "0123456789abcdef" for c in expected_sha):
        raise ValueError("invalid chunk manifest payload checksum")
    if not 0 < expected_size <= CHUNK_MANIFEST_MAX_PAYLOAD_BYTES:
        raise ValueError("invalid chunk manifest payload size")

    chunks = manifest.get("chunks")
    if (
        not isinstance(chunks, list)
        or not chunks
        or len(chunks) > CHUNK_MANIFEST_MAX_PARTS
    ):
        raise ValueError("invalid chunk manifest part count")

    assembled = bytearray()
    expected_index = 0
    for item in chunks:
        if not isinstance(item, dict) or int(item.get("index", -1)) != expected_index:
            raise ValueError("chunk manifest indices must be contiguous from zero")
        uri = str(item.get("storage_uri") or "")
        chunk_sha = str(item.get("sha256") or "")
        chunk_size = int(item.get("byte_size") or 0)
        if len(chunk_sha) != 64 or any(c not in "0123456789abcdef" for c in chunk_sha):
            raise ValueError("invalid chunk checksum")
        if chunk_size <= 0 or chunk_size > 50 * 1024 * 1024:
            raise ValueError("invalid chunk byte size")

        chunk = _download_storage_object(uri)
        if len(chunk) != chunk_size:
            raise ValueError("runtime artifact chunk byte size mismatch")
        if hashlib.sha256(chunk).hexdigest() != chunk_sha:
            raise ValueError("runtime artifact chunk checksum mismatch")
        assembled.extend(chunk)
        if len(assembled) > expected_size:
            raise ValueError("runtime artifact chunks exceed declared payload size")
        expected_index += 1

    payload = bytes(assembled)
    if len(payload) != expected_size:
        raise ValueError("runtime artifact reconstructed byte size mismatch")
    if hashlib.sha256(payload).hexdigest() != expected_sha:
        raise ValueError("runtime artifact reconstructed checksum mismatch")
    return payload


def decode_artifact(payload: bytes) -> dict:
    artifact = _decode_json_bytes(payload)
    if artifact.get("artifact_schema") == CHUNK_MANIFEST_SCHEMA:
        artifact = _decode_json_bytes(_resolve_chunk_manifest(artifact))
    if artifact.get("artifact_schema") != ARTIFACT_SCHEMA:
        raise ValueError("unsupported portable tree artifact schema")
    return artifact


def export_lightgbm_regressor(
    model: object,
    feature_cols: Iterable[str],
    *,
    feature_version: str,
    prediction_transform: dict | None = None,
) -> dict:
    booster = model.booster_
    dump = booster.dump_model()
    trees = [item["tree_structure"] for item in dump.get("tree_info", [])]
    if not trees:
        raise ValueError("LightGBM model has no trees")
    artifact = {
        "artifact_schema": ARTIFACT_SCHEMA,
        "task_type": "regression",
        "model_family": "lightgbm",
        "feature_version": feature_version,
        "feature_cols": list(feature_cols),
        "objective": dump.get("objective", "regression"),
        "num_trees": len(trees),
        "trees": trees,
    }
    if prediction_transform is not None:
        kind = prediction_transform.get("kind")
        persistence_feature = prediction_transform.get("persistence_feature")
        correction_weight = float(prediction_transform.get("correction_weight", math.nan))
        if kind != "persistence_residual_blend":
            raise ValueError("unsupported LightGBM prediction transform")
        if persistence_feature not in artifact["feature_cols"]:
            raise ValueError("LightGBM persistence feature is missing")
        if not math.isfinite(correction_weight) or not 0.0 <= correction_weight <= 2.0:
            raise ValueError("LightGBM correction weight must be within [0, 2]")
        artifact["prediction_transform"] = {
            "kind": kind,
            "persistence_feature": persistence_feature,
            "correction_weight": correction_weight,
        }
    return artifact


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
    transform = artifact.get("prediction_transform")
    if transform is not None:
        if transform.get("kind") != "persistence_residual_blend":
            raise ValueError("unsupported LightGBM prediction transform")
        persistence_feature = transform.get("persistence_feature")
        feature_cols = artifact.get("feature_cols") or []
        if persistence_feature not in feature_cols:
            raise ValueError("LightGBM persistence feature is missing")
        correction_weight = float(transform.get("correction_weight", math.nan))
        if not math.isfinite(correction_weight) or not 0.0 <= correction_weight <= 2.0:
            raise ValueError("invalid LightGBM correction weight")
        persistence = float(vector[feature_cols.index(persistence_feature)])
        prediction = persistence + correction_weight * prediction
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
        # scikit-learn converts dense classifier inputs to float32 before
        # tree traversal. Mirror that boundary exactly so a feature near a
        # split threshold cannot take a different portable branch.
        value = float(np.float32(features[feature_index]))
        node = int(left[node]) if value <= float(thresholds[node]) else int(right[node])
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
