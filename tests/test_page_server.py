import http.client
import json
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import page_server  # noqa: E402


class MockComfyHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_GET(self):
        body = json.dumps({"path": self.path}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length)
        self.send_response(200)
        self.send_header("Content-Type", self.headers.get("Content-Type", "application/octet-stream"))
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args):
        pass


class PageProxyTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tempdir = tempfile.TemporaryDirectory()
        Path(cls.tempdir.name, "index.html").write_text("Kendo Page", encoding="utf-8")

        cls.comfy = ThreadingHTTPServer(("127.0.0.1", 0), MockComfyHandler)
        page_server.PAGE_ROOT = cls.tempdir.name
        page_server.COMFY_HOST = "127.0.0.1"
        page_server.COMFY_PORT = cls.comfy.server_port
        cls.page = ThreadingHTTPServer(("127.0.0.1", 0), page_server.KendoPageHandler)

        cls.threads = [
            threading.Thread(target=cls.comfy.serve_forever, daemon=True),
            threading.Thread(target=cls.page.serve_forever, daemon=True),
        ]
        for thread in cls.threads:
            thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.page.shutdown()
        cls.comfy.shutdown()
        cls.page.server_close()
        cls.comfy.server_close()
        cls.tempdir.cleanup()

    def request(self, method, path, body=None, headers=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.page.server_port, timeout=5)
        connection.request(method, path, body=body, headers=headers or {})
        response = connection.getresponse()
        payload = response.read()
        connection.close()
        return response.status, response.getheaders(), payload

    def test_static_page(self):
        status, _headers, body = self.request("GET", "/")
        self.assertEqual(status, 200)
        self.assertEqual(body, b"Kendo Page")

    def test_get_is_proxied_with_query(self):
        status, _headers, body = self.request("GET", "/api/comfy/system_stats?full=1")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body), {"path": "/system_stats?full=1"})

    def test_post_body_and_content_type_are_preserved(self):
        payload = b'{"prompt":{"1":{"class_type":"Test"}}}'
        status, headers, body = self.request(
            "POST",
            "/api/comfy/prompt",
            body=payload,
            headers={"Content-Type": "application/json", "Content-Length": str(len(payload))},
        )
        self.assertEqual(status, 200)
        self.assertEqual(dict(headers)["Content-Type"], "application/json")
        self.assertEqual(body, payload)


if __name__ == "__main__":
    unittest.main()
