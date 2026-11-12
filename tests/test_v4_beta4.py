import http.client
import json
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import page_server_v3_beta as v3
import page_server_v4_beta4 as beta4


class FakeComfy(BaseHTTPRequestHandler):
    queue_running = []
    queue_pending = []
    events = []
    prompt_index = 0

    def log_message(self, *_args):
        pass

    def _json(self, value, status=200):
        data = json.dumps(value).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == '/queue':
            return self._json({'queue_running': self.queue_running, 'queue_pending': self.queue_pending})
        self._json({}, 404)

    def do_POST(self):
        length = int(self.headers.get('Content-Length', '0') or '0')
        body = json.loads(self.rfile.read(length) or b'{}')
        if self.path == '/free':
            self.events.append(('free', body))
            return self._json({})
        if self.path == '/prompt':
            self.__class__.prompt_index += 1
            self.events.append(('prompt', body))
            return self._json({'prompt_id': f'job-{self.prompt_index}'})
        self._json({}, 404)


class V4Beta4ModeManagerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.comfy = ThreadingHTTPServer(('127.0.0.1', 0), FakeComfy)
        v3.COMFY_PORT = cls.comfy.server_address[1]
        beta4.SWITCH_SETTLE_SECONDS = 0
        cls.page = ThreadingHTTPServer(('127.0.0.1', 0), beta4.V4Beta4Handler)
        cls.threads = [threading.Thread(target=s.serve_forever, daemon=True) for s in (cls.comfy, cls.page)]
        for thread in cls.threads:
            thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.page.shutdown()
        cls.comfy.shutdown()
        cls.page.server_close()
        cls.comfy.server_close()

    def setUp(self):
        FakeComfy.queue_running = []
        FakeComfy.queue_pending = []
        FakeComfy.events = []
        beta4.MODE_STATE.update(active_mode=None, switching=False, switch_count=0)

    def submit(self, mode):
        connection = http.client.HTTPConnection('127.0.0.1', self.page.server_address[1], timeout=5)
        payload = json.dumps({'mode': mode, 'prompt': {'save': {'class_type': 'SaveImage', 'inputs': {}}}, 'client_id': 'test'})
        connection.request('POST', '/api/kendo/prompt', payload, {'Content-Type': 'application/json'})
        response = connection.getresponse()
        body = json.loads(response.read())
        connection.close()
        return response.status, body

    def test_switch_unloads_once_and_same_mode_keeps_cache(self):
        status, first = self.submit('video')
        self.assertEqual(status, 200)
        self.assertTrue(first['vram_cleared'])
        self.assertEqual([event for event, _ in FakeComfy.events], ['free', 'prompt'])
        status, second = self.submit('video')
        self.assertEqual(status, 200)
        self.assertFalse(second['vram_cleared'])
        self.assertEqual([event for event, _ in FakeComfy.events], ['free', 'prompt', 'prompt'])
        status, image = self.submit('image')
        self.assertEqual(status, 200)
        self.assertTrue(image['mode_switched'])
        self.assertEqual([event for event, _ in FakeComfy.events], ['free', 'prompt', 'prompt', 'free', 'prompt'])

    def test_cross_mode_switch_waits_for_idle_queue(self):
        status, _ = self.submit('video')
        self.assertEqual(status, 200)
        FakeComfy.queue_running = [[1, 'active-video']]
        before = list(FakeComfy.events)
        status, body = self.submit('image')
        self.assertEqual(status, 409)
        self.assertEqual(body['queue']['running'], 1)
        self.assertEqual(FakeComfy.events, before)
        self.assertEqual(beta4.MODE_STATE['active_mode'], 'video')


if __name__ == '__main__':
    unittest.main()
