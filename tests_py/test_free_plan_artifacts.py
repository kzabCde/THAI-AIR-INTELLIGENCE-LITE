import gzip
import hashlib
import json

import pytest

from api.ml import portable_trees
from training import supabase_large_artifact_upload as free_upload


def _portable_payload():
    artifact = {
        "artifact_schema": portable_trees.ARTIFACT_SCHEMA,
        "task_type": "classification",
        "model_family": "random_forest",
        "feature_version": "test-v1",
        "feature_cols": ["pm25_mean"],
        "threshold_version": "test-threshold-v1",
        "classes": [1],
        "temperature": 1.0,
        "num_trees": 0,
        "trees": [],
    }
    return artifact, portable_trees.encode_artifact(artifact)


def _manifest(payload, chunks):
    manifest = {
        "artifact_schema": portable_trees.CHUNK_MANIFEST_SCHEMA,
        "payload_format": "json+gzip",
        "payload_sha256": hashlib.sha256(payload).hexdigest(),
        "payload_byte_size": len(payload),
        "chunks": chunks,
    }
    return gzip.compress(
        json.dumps(manifest, separators=(",", ":"), sort_keys=True).encode(),
        compresslevel=9,
        mtime=0,
    )


def test_decode_artifact_reconstructs_checksum_verified_chunks(monkeypatch):
    artifact, payload = _portable_payload()
    split = max(1, len(payload) // 2)
    pieces = [payload[:split], payload[split:]]
    objects = {}
    chunks = []
    for index, piece in enumerate(pieces):
        uri = f"storage://model-artifacts/run/part-{index}.bin"
        objects[uri] = piece
        chunks.append(
            {
                "index": index,
                "storage_uri": uri,
                "sha256": hashlib.sha256(piece).hexdigest(),
                "byte_size": len(piece),
            }
        )

    monkeypatch.setattr(
        portable_trees,
        "_download_storage_object",
        lambda uri: objects[uri],
    )
    assert portable_trees.decode_artifact(_manifest(payload, chunks)) == artifact


def test_decode_artifact_rejects_corrupt_chunk(monkeypatch):
    _, payload = _portable_payload()
    uri = "storage://model-artifacts/run/part-0.bin"
    chunks = [
        {
            "index": 0,
            "storage_uri": uri,
            "sha256": hashlib.sha256(payload).hexdigest(),
            "byte_size": len(payload),
        }
    ]
    monkeypatch.setattr(
        portable_trees,
        "_download_storage_object",
        lambda _uri: payload + b"corrupt",
    )
    with pytest.raises(ValueError, match="chunk byte size mismatch"):
        portable_trees.decode_artifact(_manifest(payload, chunks))


def test_free_plan_bundle_splits_runtime_and_writes_deterministic_manifest(
    tmp_path, monkeypatch
):
    payload = b"0123456789abcdef"
    runtime_path = tmp_path / "runtime.json.gz"
    runtime_path.write_bytes(payload)
    monkeypatch.setattr(free_upload, "RUNTIME_CHUNK_BYTES", 7)

    bundle = free_upload._write_runtime_chunk_bundle(
        runtime_path,
        hashlib.sha256(payload).hexdigest(),
        base_remote="run/pooled/classification",
    )

    assert [part["byte_size"] for part in bundle["chunks"]] == [7, 7, 2]
    assert all(
        part["byte_size"] <= free_upload.FREE_PLAN_SAFE_OBJECT_BYTES
        for part in bundle["chunks"]
    )
    manifest = json.loads(gzip.decompress(bundle["manifest_path"].read_bytes()))
    assert manifest["artifact_schema"] == free_upload.CHUNK_MANIFEST_SCHEMA
    assert manifest["payload_sha256"] == hashlib.sha256(payload).hexdigest()
    assert manifest["payload_byte_size"] == len(payload)
    assert len(manifest["chunks"]) == 3
