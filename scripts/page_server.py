#!/usr/bin/env python3
"""Serve the Kendo page and proxy its ComfyUI API calls inside the Pod."""

from __future__ import annotations

import http.client
import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit


PAGE_ROOT = os.environ.get("KENDO_PAGE_ROOT", "/opt/kendo-page")
LISTEN_HOST = os.environ.get("KENDO_PAGE_HOST", "0.0.0.0")
LISTEN_PORT = int(os.environ.get("KENDO_PAGE_PORT", "3000"))
COMFY_HOST = os.environ.get("KENDO_COMFY_HOST", "127.0.0.1")
COMFY_PORT = int(os.environ.get("KENDO_COMFY_PORT", "8188"))
PROXY_PREFIX = "/api/comfy"
STATUS_PATH = "/api/kendo/status"
MODEL_ROOT = os.environ.get(
    "KENDO_MODEL_ROOT", "/workspace/runpod-slim/ComfyUI/models"
)
READY_FILE = os.environ.get(
    "KENDO_READY_FILE", "/workspace/.kendo-h3-models-ready"
)
ERROR_FILE = os.environ.get(
    "KENDO_ERROR_FILE", "/workspace/.kendo-h3-models-error"
)
MODEL_SPECS = (
    ("diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors", 20_970_379_616),
    ("text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors", 15_687_142_551),
    ("vae/minimax_h3_video_vae_fp16.safetensors", 5_207_808_496),
    ("vae/minimax_h3_audio_vae_fp32.safetensors", 605_254_808),
    ("loras/minimax_h3_turbo_v4_step600_ema_pruned_comfyui.safetensors", 620_285_592),
)

HOP_BY_HOP_HEADERS = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
}


class KendoPageHandler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PAGE_ROOT, **kwargs)

    def do_GET(self) -> None:
        if urlsplit(self.path).path == STATUS_PATH:
            self._send_kendo_status()
            return
        if self._is_comfy_request():
            self._proxy_to_comfy()
            return
        super().do_GET()

    def do_HEAD(self) -> None:
        if urlsplit(self.path).path == STATUS_PATH:
            self._send_kendo_status(include_body=False)
            return
        if self._is_comfy_request():
            self._proxy_to_comfy(include_body=False)
            return
        super().do_HEAD()

    def do_POST(self) -> None:
        if self._is_comfy_request():
            self._proxy_to_comfy()
            return
        self.send_error(404)

    def _is_comfy_request(self) -> bool:
        path = urlsplit(self.path).path
        return path == PROXY_PREFIX or path.startswith(f"{PROXY_PREFIX}/")

    def _comfy_ready(self) -> bool:
        connection = http.client.HTTPConnection(COMFY_HOST, COMFY_PORT, timeout=2)
        try:
            connection.request("GET", "/system_stats", headers={"Connection": "close"})
            return connection.getresponse().status == 200
        except (ConnectionError, TimeoutError, OSError, http.client.HTTPException):
            return False
        finally:
            connection.close()

    def _send_kendo_status(self, include_body: bool = True) -> None:
        downloaded_bytes = 0
        total_bytes = sum(expected for _relative, expected in MODEL_SPECS)
        for relative, expected in MODEL_SPECS:
            destination = os.path.join(MODEL_ROOT, relative)
            candidate = destination if os.path.isfile(destination) else f"{destination}.part"
            try:
                downloaded_bytes += min(os.path.getsize(candidate), expected)
            except OSError:
                pass

        error_message = None
        try:
            with open(ERROR_FILE, encoding="utf-8") as error_file:
                error_message = error_file.read().strip() or "Model download failed"
        except OSError:
            pass

        payload = json.dumps(
            {
                "models_ready": os.path.isfile(READY_FILE),
                "comfy_ready": self._comfy_ready(),
                "download_error": error_message,
                "downloaded_bytes": downloaded_bytes,
                "total_bytes": total_bytes,
                "progress": round(downloaded_bytes * 100 / total_bytes, 1),
            }
        ).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        if include_body:
            self.wfile.write(payload)

    def _upstream_path(self) -> str:
        parsed = urlsplit(self.path)
        path = parsed.path[len(PROXY_PREFIX) :] or "/"
        if not path.startswith("/"):
            path = f"/{path}"
        return f"{path}?{parsed.query}" if parsed.query else path

    def _request_headers(self) -> dict[str, str]:
        headers = {}
        for name, value in self.headers.items():
            lowered = name.lower()
            if lowered in HOP_BY_HOP_HEADERS or lowered in {"host", "origin", "referer"}:
                continue
            headers[name] = value
        headers["Host"] = f"{COMFY_HOST}:{COMFY_PORT}"
        headers["Connection"] = "close"
        return headers

    def _proxy_to_comfy(self, include_body: bool = True) -> None:
        content_length = int(self.headers.get("Content-Length", "0") or "0")
        body = self.rfile.read(content_length) if content_length else None
        connection = http.client.HTTPConnection(COMFY_HOST, COMFY_PORT, timeout=120)

        try:
            connection.request(
                self.command,
                self._upstream_path(),
                body=body,
                headers=self._request_headers(),
            )
            response = connection.getresponse()
            self.send_response(response.status, response.reason)
            for name, value in response.getheaders():
                if name.lower() not in HOP_BY_HOP_HEADERS:
                    self.send_header(name, value)
            self.send_header("Connection", "close")
            self.end_headers()
            self.close_connection = True

            if include_body:
                while chunk := response.read(1024 * 256):
                    self.wfile.write(chunk)
        except (ConnectionError, TimeoutError, OSError, http.client.HTTPException) as error:
            payload = json.dumps(
                {
                    "error": "ComfyUI is not ready",
                    "detail": str(error),
                }
            ).encode("utf-8")
            self.send_response(503)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            if include_body:
                self.wfile.write(payload)
        finally:
            connection.close()


if __name__ == "__main__":
    server = ThreadingHTTPServer((LISTEN_HOST, LISTEN_PORT), KendoPageHandler)
    print(
        f"[KENDO] Page listening on {LISTEN_HOST}:{LISTEN_PORT}; "
        f"proxying {PROXY_PREFIX} to http://{COMFY_HOST}:{COMFY_PORT}",
        flush=True,
    )
    server.serve_forever()
