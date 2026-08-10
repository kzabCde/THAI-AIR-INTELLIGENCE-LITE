"""Read-only deployment capability endpoint for PM2.5 artifact promotion."""

from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self._send(
            200,
            {
                "status": "ok",
                "service": "pm25-ml-serving",
                "portable_tree_schema": "portable-tree-ensemble-v1",
                "chunk_manifest_schema": "portable-tree-chunk-manifest-v1",
                "supabase_free_plan_chunked_runtime": True,
                "build_sha": os.environ.get("VERCEL_GIT_COMMIT_SHA") or "unversioned",
            },
        )

    def _send(self, code: int, body: dict) -> None:
        payload = json.dumps(body, separators=(",", ":")).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *args):
        pass
