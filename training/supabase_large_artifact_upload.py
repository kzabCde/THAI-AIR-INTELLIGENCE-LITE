"""Large immutable Supabase Storage uploads for reviewed PM2.5 artifacts.

The normal supabase-py Storage upload is intentionally retained for small
artifacts. Files larger than the configured threshold are sent through
Supabase Storage's TUS resumable endpoint using the required 6 MiB chunks.

Run-scoped artifact paths remain immutable. Existing objects are accepted only
after a full streamed SHA-256 and byte-size verification. Registry writes and
the atomic activation RPC remain owned by ``upload_and_register`` and therefore
occur only after every artifact has been verified.
"""

from __future__ import annotations

import hashlib
import os
from pathlib import Path
from urllib.parse import quote, urlparse

import requests

TUS_CHUNK_SIZE_BYTES = 6 * 1024 * 1024
TUS_THRESHOLD_BYTES = 6 * 1024 * 1024
STREAM_VERIFY_CHUNK_BYTES = 8 * 1024 * 1024
MODEL_ARTIFACT_BUCKET = "model-artifacts"


def _service_credentials() -> tuple[str, str]:
    supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not supabase_url or not service_key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for Storage upload"
        )
    return supabase_url, service_key


def _direct_storage_tus_endpoint(supabase_url: str) -> str:
    parsed = urlparse(supabase_url)
    host = parsed.hostname or ""
    if host.endswith(".supabase.co"):
        project_ref = host[: -len(".supabase.co")]
        return (
            f"https://{project_ref}.storage.supabase.co"
            "/storage/v1/upload/resumable"
        )
    return f"{supabase_url}/storage/v1/upload/resumable"


def _authenticated_object_url(
    supabase_url: str,
    remote_path: str,
    *,
    bucket_name: str = MODEL_ARTIFACT_BUCKET,
) -> str:
    encoded_bucket = quote(bucket_name, safe="")
    encoded_path = quote(remote_path, safe="/")
    return (
        f"{supabase_url}/storage/v1/object/authenticated/"
        f"{encoded_bucket}/{encoded_path}"
    )


def _stream_verify_storage_object(
    remote_path: str,
    local_path: Path,
    expected_sha256: str,
    *,
    bucket_name: str = MODEL_ARTIFACT_BUCKET,
    allow_missing: bool = False,
    timeout_seconds: tuple[float, float] = (30.0, 300.0),
) -> bool:
    """Stream a private object and verify exact bytes without loading it in RAM."""
    supabase_url, service_key = _service_credentials()
    response = requests.get(
        _authenticated_object_url(
            supabase_url,
            remote_path,
            bucket_name=bucket_name,
        ),
        headers={
            "Authorization": f"Bearer {service_key}",
            "apikey": service_key,
        },
        stream=True,
        timeout=timeout_seconds,
    )
    if response.status_code == 404 and allow_missing:
        response.close()
        return False
    if not response.ok:
        status = response.status_code
        body = response.text[:500]
        response.close()
        raise RuntimeError(
            f"Storage readback failed for {remote_path}: HTTP {status}: {body}"
        )

    digest = hashlib.sha256()
    observed_size = 0
    try:
        for chunk in response.iter_content(chunk_size=STREAM_VERIFY_CHUNK_BYTES):
            if not chunk:
                continue
            digest.update(chunk)
            observed_size += len(chunk)
    finally:
        response.close()

    observed_sha256 = digest.hexdigest()
    expected_size = Path(local_path).stat().st_size
    if observed_sha256 != expected_sha256 or observed_size != expected_size:
        raise RuntimeError(
            "Refusing Storage artifact with mismatched bytes: "
            f"{remote_path}; expected sha256={expected_sha256}, size={expected_size}; "
            f"observed sha256={observed_sha256}, size={observed_size}. "
            "No Registry or activation RPC was called."
        )
    return True


def _looks_like_conflict(error: Exception) -> bool:
    text = f"{error.__class__.__name__} {error}".lower()
    return "409" in text or "conflict" in text or "already exists" in text


def _looks_like_size_limit(error: Exception) -> bool:
    text = f"{error.__class__.__name__} {error}".lower()
    return (
        "413" in text
        or "payload too large" in text
        or "maximum allowed size" in text
        or "entity too large" in text
    )


def _tus_upload_immutable(
    remote_path: str,
    local_path: Path,
    expected_sha256: str,
    *,
    bucket_name: str = MODEL_ARTIFACT_BUCKET,
) -> bool:
    """Upload one large object using Supabase TUS.

    Returns True when an already-existing checksum-identical object was reused.
    """
    local_path = Path(local_path)

    if _stream_verify_storage_object(
        remote_path,
        local_path,
        expected_sha256,
        bucket_name=bucket_name,
        allow_missing=True,
    ):
        print(
            {
                "storage_large_object": remote_path,
                "status": "reused_after_streamed_sha256_verification",
                "bytes": local_path.stat().st_size,
            }
        )
        return True

    try:
        from tusclient import client as tus_client
    except ImportError as error:
        raise RuntimeError(
            "tus-py-client is required for artifacts larger than 6 MiB. "
            "Install it in the Colab bootstrap cell before rerunning Cell 13."
        ) from error

    supabase_url, service_key = _service_credentials()
    endpoint = _direct_storage_tus_endpoint(supabase_url)
    tus = tus_client.TusClient(
        endpoint,
        headers={
            "Authorization": f"Bearer {service_key}",
            "apikey": service_key,
            "x-upsert": "false",
        },
    )

    print(
        {
            "storage_large_object": remote_path,
            "status": "tus_upload_start",
            "bytes": local_path.stat().st_size,
            "chunk_bytes": TUS_CHUNK_SIZE_BYTES,
            "endpoint_host": urlparse(endpoint).hostname,
        }
    )
    try:
        with local_path.open("rb") as handle:
            uploader = tus.uploader(
                file_stream=handle,
                chunk_size=TUS_CHUNK_SIZE_BYTES,
                metadata={
                    "bucketName": bucket_name,
                    "objectName": remote_path,
                    "contentType": "application/octet-stream",
                    "cacheControl": "3600",
                    "metadata": (
                        '{"sha256":"'
                        + expected_sha256
                        + '","immutable":true,"uploader":"pm25-cell13-tus"}'
                    ),
                },
            )
            uploader.upload()
    except Exception as error:
        if _looks_like_conflict(error) and _stream_verify_storage_object(
            remote_path,
            local_path,
            expected_sha256,
            bucket_name=bucket_name,
            allow_missing=True,
        ):
            print(
                {
                    "storage_large_object": remote_path,
                    "status": "reused_after_tus_conflict_verification",
                }
            )
            return True
        if _looks_like_size_limit(error):
            raise RuntimeError(
                f"Supabase rejected {remote_path} ({local_path.stat().st_size} bytes) "
                "with HTTP 413. The project/global Storage file-size limit must be "
                "raised above this artifact size; the bucket-level limit alone does "
                "not override the global/plan limit. No Registry or activation RPC "
                "was called."
            ) from error
        raise

    _stream_verify_storage_object(
        remote_path,
        local_path,
        expected_sha256,
        bucket_name=bucket_name,
        allow_missing=False,
    )
    print(
        {
            "storage_large_object": remote_path,
            "status": "tus_upload_verified",
            "sha256": expected_sha256,
            "bytes": local_path.stat().st_size,
        }
    )
    return False


def install_large_artifact_upload_patch(upload_and_register) -> None:
    """Patch only the artifact-transfer helper used by upload_and_register."""
    globals_dict = getattr(upload_and_register, "__globals__", None)
    if not isinstance(globals_dict, dict):
        raise TypeError("upload_and_register is not a Python function with mutable globals")

    original = globals_dict.get("_upload_or_verify_immutable_artifact")
    if not callable(original):
        raise RuntimeError("Could not locate the reviewed immutable upload helper")

    if globals_dict.get("_pm25_tus_upload_patch_installed"):
        return

    def large_aware_upload(bucket, remote_path, local_path, expected_sha256):
        path = Path(local_path)
        if path.stat().st_size <= TUS_THRESHOLD_BYTES:
            return original(bucket, remote_path, path, expected_sha256)
        return _tus_upload_immutable(
            remote_path,
            path,
            expected_sha256,
            bucket_name=MODEL_ARTIFACT_BUCKET,
        )

    globals_dict["_upload_or_verify_immutable_artifact"] = large_aware_upload
    globals_dict["_pm25_tus_upload_patch_installed"] = True
    globals_dict["_pm25_tus_original_upload_helper"] = original
    print(
        {
            "cell13_storage_upload": "large_artifact_tus_patch_installed",
            "threshold_bytes": TUS_THRESHOLD_BYTES,
            "tus_chunk_bytes": TUS_CHUNK_SIZE_BYTES,
            "immutability": "upsert_false_and_sha256_readback",
        }
    )
