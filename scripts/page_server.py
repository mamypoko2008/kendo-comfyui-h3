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
        if self._is_comfy_request():
            self._proxy_to_comfy()
            return
        super().do_GET()

    def do_HEAD(self) -> None:
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
