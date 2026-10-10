import http.client
import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import download_image_models as image_models
import page_server_v3_beta as page

class ImageInstallerTest(unittest.TestCase):
    def test_pinned_turbo_install_and_optional_base_share_encoder_and_vae(self):
        turbo = image_models.selected_specs('qwen21-turbo')
        both = image_models.selected_specs('qwen21-turbo,qwen21,qwen21')
        self.assertEqual(len(turbo), 3)
        self.assertEqual(len(both), 4)
        self.assertEqual(sum(size for _, size in turbo), 17283095877)
        self.assertIn(image_models.REVISION, image_models.REPO)
        with self.assertRaises(ValueError): image_models.selected_specs('unknown')

    def test_reuses_complete_file_and_rejects_incomplete_download(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder, 'vae', 'test.bin')
            target.parent.mkdir()
            target.write_bytes(b'12345')
            with patch.object(image_models.subprocess, 'run') as run:
                image_models.download(folder, 'vae/test.bin', 5)
                run.assert_not_called()
            partial = Path(str(target) + '.part')
            partial.write_bytes(b'12')
            with patch.object(image_models.subprocess, 'run'):
                with self.assertRaises(RuntimeError): image_models.download(folder, 'vae/test.bin', 6)
            self.assertFalse(target.exists())
            self.assertEqual(partial.read_bytes(), b'12')

class StudioProxyTest(unittest.TestCase):
    def test_proxy_preserves_access_cookie_public_origin_host_and_response_cookie(self):
        seen = []
        class MockStudio(BaseHTTPRequestHandler):
            def do_POST(self):
                body = self.rfile.read(int(self.headers['Content-Length']))
                seen.append((self.path, dict(self.headers), json.loads(body)))
                result = b'{"ok":true}'
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(result)))
                self.send_header('Set-Cookie', 'kendo_studio=test; Path=/api/kie; HttpOnly; SameSite=Strict')
                self.end_headers()
                self.wfile.write(result)
            def log_message(self, *args): pass
        studio = ThreadingHTTPServer(('127.0.0.1', 0), MockStudio)
        threading.Thread(target=studio.serve_forever, daemon=True).start()
        with patch.object(page, 'STUDIO_PORT', studio.server_port):
            server = ThreadingHTTPServer(('127.0.0.1', 0), page.V3Handler)
            threading.Thread(target=server.serve_forever, daemon=True).start()
            try:
                conn = http.client.HTTPConnection('127.0.0.1', server.server_port)
                conn.request('POST', '/api/kie/connect', json.dumps({'code': 'test'}), {
                    'Host': 'pod-3000.proxy.runpod.net', 'Origin': 'https://pod-3000.proxy.runpod.net',
                    'Cookie': 'kendo_studio=previous', 'Content-Type': 'application/json'})
                response = conn.getresponse()
                self.assertEqual(response.status, 200)
                self.assertIn('HttpOnly', response.getheader('Set-Cookie'))
                self.assertEqual(json.loads(response.read()), {'ok': True})
                conn.close()
                self.assertEqual(seen[0][0], '/api/kie/connect')
                self.assertEqual(seen[0][1]['Host'], 'pod-3000.proxy.runpod.net')
                self.assertEqual(seen[0][1]['Origin'], 'https://pod-3000.proxy.runpod.net')
                self.assertEqual(seen[0][1]['Cookie'], 'kendo_studio=previous')
                self.assertEqual(seen[0][2], {'code': 'test'})
            finally:
                server.shutdown(); server.server_close()
                studio.shutdown(); studio.server_close()

if __name__ == '__main__': unittest.main()
