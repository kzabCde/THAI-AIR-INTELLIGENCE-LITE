from pathlib import Path

path = Path("api/ml/forecast.py")
text = path.read_text()

old_imports = '''from __future__ import annotations

import hmac
import hashlib
import json
import math
import os
import uuid
'''
new_imports = '''from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
import hmac
import hashlib
import json
import math
import os
import threading
import time
import uuid
'''
if old_imports not in text:
    raise SystemExit("forecast import anchor not found")
text = text.replace(old_imports, new_imports, 1)

policy_anchor = '''SUPPORTED_SERVING_POLICIES = {
    "direct_classifier",
    "regression_threshold",
    "classifier_with_regression_fallback",
}

FEATURE_COLS = [
'''
policy_replacement = '''SUPPORTED_SERVING_POLICIES = {
    "direct_classifier",
    "regression_threshold",
    "classifier_with_regression_fallback",
}


def _bounded_env_int(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(os.environ.get(name, str(default)))
    except (TypeError, ValueError):
        value = default
    return max(minimum, min(maximum, value))


ARTIFACT_DOWNLOAD_WORKERS = _bounded_env_int(
    "PM25_ARTIFACT_DOWNLOAD_WORKERS",
    8,
    1,
    12,
)
RUNTIME_ARTIFACT_CACHE_MAX_ENTRIES = _bounded_env_int(
    "PM25_RUNTIME_ARTIFACT_CACHE_MAX_ENTRIES",
    64,
    20,
    256,
)
_RUNTIME_ARTIFACT_CACHE: dict[str, dict] = {}
_RUNTIME_ARTIFACT_CACHE_LOCK = threading.Lock()

FEATURE_COLS = [
'''
if policy_anchor not in text:
    raise SystemExit("forecast policy anchor not found")
text = text.replace(policy_anchor, policy_replacement, 1)

start = text.index("def load_runtime_artifact(\n")
end = text.index("\ndef load_active_models(", start)
replacement = r'''def _runtime_artifact_cache_key(model_row: dict | None) -> str | None:
    if not model_row:
        return None
    params = model_row.get("model_params") or {}
    uri = model_row.get("runtime_artifact_uri") or params.get("runtime_artifact_uri")
    expected_sha = (
        model_row.get("runtime_artifact_sha256")
        or params.get("runtime_artifact_sha256")
    )
    if not uri or not expected_sha:
        return None
    return f"{uri}#{expected_sha}"


def _module_cached_runtime_artifact(cache_key: str) -> dict | None:
    with _RUNTIME_ARTIFACT_CACHE_LOCK:
        return _RUNTIME_ARTIFACT_CACHE.get(cache_key)


def _remember_runtime_artifact(cache_key: str, artifact: dict) -> None:
    with _RUNTIME_ARTIFACT_CACHE_LOCK:
        if cache_key in _RUNTIME_ARTIFACT_CACHE:
            _RUNTIME_ARTIFACT_CACHE[cache_key] = artifact
            return
        while len(_RUNTIME_ARTIFACT_CACHE) >= RUNTIME_ARTIFACT_CACHE_MAX_ENTRIES:
            _RUNTIME_ARTIFACT_CACHE.pop(next(iter(_RUNTIME_ARTIFACT_CACHE)))
        _RUNTIME_ARTIFACT_CACHE[cache_key] = artifact


def load_runtime_artifact(
    sb: Client,
    model_row: dict | None,
    cache: dict[str, dict | None],
) -> dict | None:
    if not model_row:
        return None
    params = model_row.get("model_params") or {}
    uri = model_row.get("runtime_artifact_uri") or params.get("runtime_artifact_uri")
    expected_sha = (
        model_row.get("runtime_artifact_sha256")
        or params.get("runtime_artifact_sha256")
    )
    cache_key = _runtime_artifact_cache_key(model_row)
    if cache_key is None:
        return None
    if cache_key in cache:
        return cache[cache_key]
    warm_artifact = _module_cached_runtime_artifact(cache_key)
    if warm_artifact is not None:
        cache[cache_key] = warm_artifact
        return warm_artifact
    bucket, path = _storage_location(str(uri))
    payload = sb.storage.from_(bucket).download(path)
    expected_size = model_row.get("runtime_artifact_byte_size")
    if expected_size is not None and len(payload) != int(expected_size):
        raise ValueError("runtime artifact byte size mismatch")
    if hashlib.sha256(payload).hexdigest() != str(expected_sha):
        raise ValueError("runtime artifact checksum mismatch")
    if model_row.get("runtime_artifact_format") not in (None, "json+gzip"):
        raise ValueError("unsupported runtime artifact format")
    artifact = decode_artifact(payload)
    if artifact.get("feature_version") != (
        model_row.get("feature_version") or params.get("feature_version")
    ):
        raise ValueError("runtime artifact feature version mismatch")
    expected_task = model_row.get("task_type")
    if expected_task and artifact.get("task_type") != expected_task:
        raise ValueError("runtime artifact task mismatch")
    expected_family = (
        model_row.get("serving_model_family")
        or params.get("serving_model_family")
    )
    if expected_family and artifact.get("model_family") != expected_family:
        raise ValueError("runtime artifact model family mismatch")
    expected_features = params.get("feature_cols")
    if expected_features and artifact.get("feature_cols") != expected_features:
        raise ValueError("runtime artifact feature order mismatch")
    expected_threshold = model_row.get("threshold_version")
    if (
        expected_task == "classification"
        and expected_threshold
        and artifact.get("threshold_version") != expected_threshold
    ):
        raise ValueError("runtime artifact threshold version mismatch")
    cache[cache_key] = artifact
    _remember_runtime_artifact(cache_key, artifact)
    return artifact


def prefetch_runtime_artifacts(
    sb: Client,
    model_rows: list[dict],
    cache: dict[str, dict | None],
    *,
    max_workers: int | None = None,
) -> dict[str, dict | None]:
    """Download distinct runtime artifacts concurrently, preserving fail-closed behavior."""
    unique_rows: dict[str, dict] = {}
    warm_hits = 0
    for row in model_rows:
        cache_key = _runtime_artifact_cache_key(row)
        if cache_key is None or cache_key in cache or cache_key in unique_rows:
            continue
        warm_artifact = _module_cached_runtime_artifact(cache_key)
        if warm_artifact is not None:
            cache[cache_key] = warm_artifact
            warm_hits += 1
            continue
        unique_rows[cache_key] = row

    if not unique_rows:
        return cache

    workers = min(
        max_workers or ARTIFACT_DOWNLOAD_WORKERS,
        len(unique_rows),
    )
    started = time.perf_counter()
    failures = 0

    if workers <= 1:
        for cache_key, row in unique_rows.items():
            try:
                artifact = load_runtime_artifact(sb, row, {})
            except Exception:
                artifact = None
                failures += 1
            cache[cache_key] = artifact
    else:
        with ThreadPoolExecutor(
            max_workers=workers,
            thread_name_prefix="pm25-artifact",
        ) as executor:
            futures = {
                executor.submit(load_runtime_artifact, sb, row, {}): cache_key
                for cache_key, row in unique_rows.items()
            }
            for future in as_completed(futures):
                cache_key = futures[future]
                try:
                    artifact = future.result()
                except Exception:
                    artifact = None
                    failures += 1
                cache[cache_key] = artifact

    print(json.dumps({
        "event": "runtime_artifact_prefetch",
        "requested": len(unique_rows) + warm_hits,
        "downloaded": len(unique_rows),
        "warm_cache_hits": warm_hits,
        "failures": failures,
        "workers": workers,
        "elapsed_ms": round((time.perf_counter() - started) * 1000, 1),
    }))
    return cache

'''
text = text[:start] + replacement + text[end + 1:]

cache_anchor = '''    runtime_cache: dict[str, dict] = {}
    needs_legacy = any(
'''
cache_replacement = '''    runtime_cache: dict[str, dict | None] = {}
    prefetch_runtime_artifacts(
        sb,
        [*active_models.values(), *active_classifiers.values()],
        runtime_cache,
    )
    needs_legacy = any(
'''
if cache_anchor not in text:
    raise SystemExit("forecast runtime cache anchor not found")
text = text.replace(cache_anchor, cache_replacement, 1)
path.write_text(text)

test_path = Path("tests_py/test_ml_forecast.py")
tests = test_path.read_text()
test_anchor = '''    cache = {}
    loaded = ml.load_runtime_artifact(SB(), row, cache)
    assert loaded == artifact
    assert ml.load_runtime_artifact(SB(), row, cache) is loaded
    assert downloads == ["run/pooled/regression/runtime.json.gz"]
'''
test_replacement = '''    ml._RUNTIME_ARTIFACT_CACHE.clear()
    cache = {}
    loaded = ml.load_runtime_artifact(SB(), row, cache)
    assert loaded == artifact
    assert ml.load_runtime_artifact(SB(), row, cache) is loaded
    second_request_cache = {}
    assert ml.load_runtime_artifact(SB(), row, second_request_cache) is loaded
    assert downloads == ["run/pooled/regression/runtime.json.gz"]
'''
if test_anchor not in tests:
    raise SystemExit("artifact cache test anchor not found")
tests = tests.replace(test_anchor, test_replacement, 1)

append_test = r'''

def test_runtime_artifacts_are_prefetched_concurrently():
    import threading
    import time

    artifact = {
        "artifact_schema": ml.TREE_ARTIFACT_SCHEMA,
        "task_type": "regression",
        "model_family": "lightgbm",
        "feature_version": "concurrency-test",
        "feature_cols": ["pm25_mean", "forecast_horizon_days"],
        "trees": [{"leaf_value": 42.0}],
    }
    payload = encode_artifact(artifact)
    digest = ml.hashlib.sha256(payload).hexdigest()
    state_lock = threading.Lock()
    active = 0
    max_active = 0
    downloads = []

    class Bucket:
        def download(self, path):
            nonlocal active, max_active
            with state_lock:
                downloads.append(path)
                active += 1
                max_active = max(max_active, active)
            time.sleep(0.05)
            with state_lock:
                active -= 1
            return payload

    class Storage:
        def from_(self, bucket):
            assert bucket == "model-artifacts"
            return Bucket()

    class SB:
        storage = Storage()

    rows = [
        {
            "task_type": "regression",
            "feature_version": "concurrency-test",
            "runtime_artifact_uri": f"storage://model-artifacts/run/TH-{30 + index}/runtime.json.gz",
            "runtime_artifact_sha256": digest,
        }
        for index in range(4)
    ]
    ml._RUNTIME_ARTIFACT_CACHE.clear()
    cache = {}
    ml.prefetch_runtime_artifacts(SB(), rows, cache, max_workers=4)

    assert len(downloads) == 4
    assert max_active >= 2
    assert len(cache) == 4
    assert all(value == artifact for value in cache.values())
'''
if "def test_runtime_artifacts_are_prefetched_concurrently()" not in tests:
    tests += append_test
test_path.write_text(tests)
