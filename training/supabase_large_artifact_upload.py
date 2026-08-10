"""Supabase Free-plan artifact deployment for PM2.5 Production.

Supabase Free limits a single Storage object to 50 MB. The reviewed pooled
Random Forest native model is therefore kept as a Google Drive training
artifact, while its portable runtime payload is split into immutable 20 MiB
Storage chunks plus a small deterministic gzip JSON manifest.

All chunks and the manifest are checksum-verified before any Registry RPC.
The existing fn_activate_pooled_dual_model_run remains the only activation
transaction boundary, so Regression and Classification still promote together.
"""

from __future__ import annotations

import gzip
import hashlib
import json
from pathlib import Path
from typing import Callable

FREE_PLAN_MAX_OBJECT_BYTES = 50 * 1024 * 1024
FREE_PLAN_SAFE_OBJECT_BYTES = 45 * 1024 * 1024
RUNTIME_CHUNK_BYTES = 20 * 1024 * 1024
CHUNK_MANIFEST_SCHEMA = "portable-tree-chunk-manifest-v1"
MODEL_ARTIFACT_BUCKET = "model-artifacts"


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _write_runtime_chunk_bundle(
    runtime_path: Path,
    expected_runtime_sha256: str,
    *,
    base_remote: str,
) -> dict:
    runtime_path = Path(runtime_path)
    payload_size = runtime_path.stat().st_size
    if _sha256_file(runtime_path) != expected_runtime_sha256:
        raise RuntimeError("local runtime artifact checksum changed before chunking")

    bundle_dir = runtime_path.parent / "supabase_free_bundle"
    bundle_dir.mkdir(parents=True, exist_ok=True)
    chunks: list[dict] = []
    with runtime_path.open("rb") as source:
        index = 0
        while True:
            payload = source.read(RUNTIME_CHUNK_BYTES)
            if not payload:
                break
            if len(payload) > FREE_PLAN_SAFE_OBJECT_BYTES:
                raise RuntimeError("runtime chunk exceeds Free-plan safety limit")
            part_name = f"runtime.part-{index:04d}.bin"
            part_path = bundle_dir / part_name
            part_path.write_bytes(payload)
            part_sha = hashlib.sha256(payload).hexdigest()
            chunks.append(
                {
                    "index": index,
                    "storage_uri": (
                        f"storage://{MODEL_ARTIFACT_BUCKET}/"
                        f"{base_remote}/runtime.parts/{part_name}"
                    ),
                    "sha256": part_sha,
                    "byte_size": len(payload),
                    "local_path": part_path,
                    "remote_path": f"{base_remote}/runtime.parts/{part_name}",
                }
            )
            index += 1

    if not chunks:
        raise RuntimeError("runtime artifact produced no chunks")
    if sum(item["byte_size"] for item in chunks) != payload_size:
        raise RuntimeError("runtime chunk sizes do not reconstruct the source payload")

    manifest = {
        "artifact_schema": CHUNK_MANIFEST_SCHEMA,
        "payload_format": "json+gzip",
        "payload_sha256": expected_runtime_sha256,
        "payload_byte_size": payload_size,
        "chunk_size_bytes": RUNTIME_CHUNK_BYTES,
        "chunks": [
            {
                "index": item["index"],
                "storage_uri": item["storage_uri"],
                "sha256": item["sha256"],
                "byte_size": item["byte_size"],
            }
            for item in chunks
        ],
    }
    manifest_json = json.dumps(
        manifest,
        allow_nan=False,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    manifest_payload = gzip.compress(manifest_json, compresslevel=9, mtime=0)
    manifest_path = bundle_dir / "runtime.manifest.json.gz"
    manifest_path.write_bytes(manifest_payload)
    manifest_sha = hashlib.sha256(manifest_payload).hexdigest()
    if manifest_path.stat().st_size > FREE_PLAN_SAFE_OBJECT_BYTES:
        raise RuntimeError("runtime manifest unexpectedly exceeds Free-plan safety limit")

    return {
        "chunks": chunks,
        "manifest_path": manifest_path,
        "manifest_sha256": manifest_sha,
        "manifest_byte_size": manifest_path.stat().st_size,
        "manifest_remote_path": f"{base_remote}/runtime.manifest.json.gz",
        "manifest_storage_uri": (
            f"storage://{MODEL_ARTIFACT_BUCKET}/"
            f"{base_remote}/runtime.manifest.json.gz"
        ),
        "payload_sha256": expected_runtime_sha256,
        "payload_byte_size": payload_size,
    }


def make_free_plan_upload_and_register(
    reviewed_upload_and_register: Callable,
) -> Callable:
    """Return a Free-plan-aware replacement for the reviewed Cell 13 function."""
    globals_dict = getattr(reviewed_upload_and_register, "__globals__", None)
    if not isinstance(globals_dict, dict):
        raise TypeError("reviewed upload_and_register has no mutable globals")
    upload_or_verify = globals_dict.get("_upload_or_verify_immutable_artifact")
    versions = globals_dict.get("_versions")
    if not callable(upload_or_verify) or not callable(versions):
        raise RuntimeError("reviewed immutable Storage helpers are unavailable")

    def upload_and_register_free(
        sb,
        result,
        artifacts,
        *,
        activate: bool,
    ) -> None:
        bucket = sb.storage.from_(MODEL_ARTIFACT_BUCKET)
        dependency_lock = versions()
        reused_objects: list[str] = []
        skipped_native: list[str] = []
        uploaded_chunks = 0

        for task_type, task_artifacts in artifacts.items():
            for artifact_key, paths in task_artifacts.items():
                base = (
                    f"{result.run_id}/{artifact_key}/regression"
                    if task_type == "regression"
                    else f"{result.run_id}/pooled/classification"
                )
                native_path = Path(paths["native_path"])
                runtime_path = Path(paths["runtime_path"])

                # Native artifacts are research/reproducibility evidence, not required
                # by Vercel inference. Keep oversized RF teacher artifacts on Drive.
                native_remote = f"{base}/model.joblib"
                native_uploaded = native_path.stat().st_size <= FREE_PLAN_SAFE_OBJECT_BYTES
                if native_uploaded:
                    if upload_or_verify(
                        bucket,
                        native_remote,
                        native_path,
                        paths["native_sha256"],
                    ):
                        reused_objects.append(native_remote)
                else:
                    skipped_native.append(native_remote)

                if runtime_path.stat().st_size <= FREE_PLAN_SAFE_OBJECT_BYTES:
                    runtime_remote = f"{base}/runtime.json.gz"
                    if upload_or_verify(
                        bucket,
                        runtime_remote,
                        runtime_path,
                        paths["runtime_sha256"],
                    ):
                        reused_objects.append(runtime_remote)
                    runtime_fields = {
                        "runtime_artifact_uri": (
                            f"storage://{MODEL_ARTIFACT_BUCKET}/{runtime_remote}"
                        ),
                        "runtime_artifact_sha256": paths["runtime_sha256"],
                        "runtime_artifact_byte_size": runtime_path.stat().st_size,
                        "runtime_artifact_format": "json+gzip",
                    }
                    runtime_audit = {
                        "runtime_storage_mode": "single_object",
                        "runtime_payload_sha256": paths["runtime_sha256"],
                        "runtime_payload_byte_size": runtime_path.stat().st_size,
                    }
                else:
                    bundle = _write_runtime_chunk_bundle(
                        runtime_path,
                        paths["runtime_sha256"],
                        base_remote=base,
                    )
                    for item in bundle["chunks"]:
                        if upload_or_verify(
                            bucket,
                            item["remote_path"],
                            item["local_path"],
                            item["sha256"],
                        ):
                            reused_objects.append(item["remote_path"])
                        uploaded_chunks += 1
                    if upload_or_verify(
                        bucket,
                        bundle["manifest_remote_path"],
                        bundle["manifest_path"],
                        bundle["manifest_sha256"],
                    ):
                        reused_objects.append(bundle["manifest_remote_path"])
                    runtime_fields = {
                        # Keep json+gzip so the existing activation RPC remains
                        # backward-compatible. decode_artifact resolves the manifest.
                        "runtime_artifact_uri": bundle["manifest_storage_uri"],
                        "runtime_artifact_sha256": bundle["manifest_sha256"],
                        "runtime_artifact_byte_size": bundle["manifest_byte_size"],
                        "runtime_artifact_format": "json+gzip",
                    }
                    runtime_audit = {
                        "runtime_storage_mode": "supabase-free-chunk-manifest-v1",
                        "runtime_payload_sha256": bundle["payload_sha256"],
                        "runtime_payload_byte_size": bundle["payload_byte_size"],
                        "runtime_chunk_count": len(bundle["chunks"]),
                        "runtime_chunk_size_bytes": RUNTIME_CHUNK_BYTES,
                        "runtime_manifest_schema": CHUNK_MANIFEST_SCHEMA,
                    }

                for row in result.registry_rows:
                    if row["task_type"] != task_type:
                        continue
                    if task_type == "regression" and row["province_id"] != artifact_key:
                        continue

                    model_params = dict(row.get("model_params") or {})
                    model_params.update(runtime_audit)
                    model_params.update(
                        {
                            "native_artifact_sha256": paths["native_sha256"],
                            "native_artifact_byte_size": native_path.stat().st_size,
                            "native_artifact_storage": (
                                "supabase"
                                if native_uploaded
                                else "google-drive-only-free-plan"
                            ),
                            "supabase_free_plan_compatible": True,
                        }
                    )
                    row["model_params"] = model_params

                    if native_uploaded:
                        row.update(
                            {
                                "artifact_uri": (
                                    f"storage://{MODEL_ARTIFACT_BUCKET}/{native_remote}"
                                ),
                                "artifact_sha256": paths["native_sha256"],
                                "artifact_byte_size": native_path.stat().st_size,
                                "artifact_content_type": "application/octet-stream",
                            }
                        )
                    else:
                        # Explicitly clear any values left by a prior failed retry.
                        row["artifact_uri"] = None
                        row["artifact_sha256"] = None
                        row["artifact_byte_size"] = None
                        row["artifact_content_type"] = None

                    row.update(
                        {
                            **runtime_fields,
                            "dependency_lock": dependency_lock,
                        }
                    )

        runtime_rows = [
            row for row in result.registry_rows
            if row.get("runtime_artifact_uri")
            and row.get("runtime_artifact_sha256")
            and int(row.get("runtime_artifact_byte_size") or 0) > 0
            and row.get("runtime_artifact_format") == "json+gzip"
        ]
        if len(runtime_rows) != len(result.registry_rows):
            raise RuntimeError(
                "Free-plan artifact preflight did not prepare all 40 runtime rows; "
                "no Registry or activation RPC was called."
            )

        # Only after every immutable object has been checksum-verified.
        sb.rpc("fn_upsert_model_registry", {"rows": result.registry_rows}).execute()
        if activate:
            sb.rpc(
                "fn_activate_pooled_dual_model_run",
                {
                    "p_run_id": result.run_id,
                    "p_required_provinces": len(result.province_ids),
                },
            ).execute()

        print(
            {
                "supabase_plan": "free",
                "runtime_chunk_bytes": RUNTIME_CHUNK_BYTES,
                "runtime_chunks_uploaded_or_verified": uploaded_chunks,
                "oversized_native_artifacts_kept_on_drive": len(skipped_native),
                "storage_objects_reused_after_checksum_verification": len(reused_objects),
                "registry_rows": len(result.registry_rows),
                "atomic_activation_requested": bool(activate),
                "run_id": result.run_id,
            }
        )

    return upload_and_register_free
