"""V4 beta.4 Page with serialized video/image mode switching.

Both the browser and MCP submit through ``/api/kendo/prompt``.  A mode change
is accepted only while ComfyUI's queue is idle, then ComfyUI's native ``/free``
endpoint unloads the previous model set before the new graph is queued.
"""
import http.client
import json
import threading
import time
from http.server import ThreadingHTTPServer
from urllib.parse import urlsplit

import page_server_v3_beta as v3
import page_server_v4_beta3 as beta3


MANAGED_PROMPT_PATH = '/api/kendo/prompt'
MODE_STATUS_PATH = '/api/kendo/mode'
MAX_PROMPT_BYTES = 8 * 1024 * 1024
SWITCH_SETTLE_SECONDS = 0.75
MODE_LOCK = threading.Lock()
MODE_STATE = {
    'active_mode': None,
    'switching': False,
    'switch_count': 0,
}


def _comfy_request(method, path, payload=None, timeout=120):
    body = None
    headers = {'Connection': 'close'}
    if payload is not None:
        body = json.dumps(payload).encode('utf-8')
        headers['Content-Type'] = 'application/json'
        headers['Content-Length'] = str(len(body))
    connection = http.client.HTTPConnection(v3.base.COMFY_HOST, v3.COMFY_PORT, timeout=timeout)
    try:
        connection.request(method, path, body=body, headers=headers)
        response = connection.getresponse()
        raw = response.read()
        try:
            data = json.loads(raw.decode('utf-8')) if raw else {}
        except (UnicodeDecodeError, ValueError):
            data = {'raw': raw.decode('utf-8', errors='replace')}
        return response.status, data
    finally:
        connection.close()


def _queue_counts(queue):
    return len(queue.get('queue_running') or []), len(queue.get('queue_pending') or [])


class V4Beta4Handler(beta3.V4Beta3Handler):
    def _json(self, status, payload):
        data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if urlsplit(self.path).path == MODE_STATUS_PATH:
            with MODE_LOCK:
                payload = dict(MODE_STATE)
            try:
                status, queue = _comfy_request('GET', '/queue', timeout=5)
                if status == 200:
                    running, pending = _queue_counts(queue)
                    payload['queue'] = {'running': running, 'pending': pending}
            except (ConnectionError, TimeoutError, OSError, http.client.HTTPException):
                payload['comfy_ready'] = False
            self._json(200, payload)
            return
        super().do_GET()

    def do_POST(self):
        if urlsplit(self.path).path == MANAGED_PROMPT_PATH:
            self._managed_prompt()
            return
        super().do_POST()

    def _managed_prompt(self):
        try:
            length = int(self.headers.get('Content-Length', '0') or '0')
        except ValueError:
            self._json(400, {'error': 'Invalid Content-Length'})
            return
        if length <= 0 or length > MAX_PROMPT_BYTES:
            self._json(413 if length > MAX_PROMPT_BYTES else 400, {'error': 'Invalid prompt payload size'})
            return
        try:
            request = json.loads(self.rfile.read(length))
        except (UnicodeDecodeError, ValueError):
            self._json(400, {'error': 'Prompt payload must be valid JSON'})
            return
        mode = request.pop('mode', None)
        if mode not in ('video', 'image') or not isinstance(request.get('prompt'), dict):
            self._json(400, {'error': 'mode must be video or image and prompt must be a workflow object'})
            return

        with MODE_LOCK:
            previous = MODE_STATE['active_mode']
            switched = previous != mode
            try:
                queue_status, queue = _comfy_request('GET', '/queue', timeout=10)
                if queue_status != 200:
                    self._json(503, {'error': 'ComfyUI queue is unavailable', 'detail': queue})
                    return
                running, pending = _queue_counts(queue)
                if switched and (running or pending):
                    self._json(409, {
                        'error': 'รอให้งานในโหมดเดิมเสร็จก่อนสลับโหมด',
                        'active_mode': previous,
                        'requested_mode': mode,
                        'queue': {'running': running, 'pending': pending},
                    })
                    return

                cleared = False
                if switched:
                    MODE_STATE['switching'] = True
                    free_status, free_result = _comfy_request(
                        'POST', '/free', {'unload_models': True, 'free_memory': True}, timeout=30
                    )
                    if free_status >= 300:
                        self._json(503, {'error': 'ComfyUI could not unload the previous mode', 'detail': free_result})
                        return
                    # /free is asynchronous: give the idle worker a short window
                    # to consume its unload/free flags before queuing the next graph.
                    if SWITCH_SETTLE_SECONDS:
                        time.sleep(SWITCH_SETTLE_SECONDS)
                    MODE_STATE['active_mode'] = mode
                    MODE_STATE['switch_count'] += 1
                    cleared = True

                prompt_status, result = _comfy_request('POST', '/prompt', request, timeout=120)
                if isinstance(result, dict):
                    result.setdefault('kendo_mode', mode)
                    result.setdefault('mode_switched', switched)
                    result.setdefault('vram_cleared', cleared)
                self._json(prompt_status, result)
            except (ConnectionError, TimeoutError, OSError, http.client.HTTPException) as error:
                self._json(503, {'error': 'ComfyUI is not ready', 'detail': str(error)})
            finally:
                MODE_STATE['switching'] = False

    def end_headers(self):
        if urlsplit(self.path).path in (
            '/', '/index.html', '/v4-beta4.html', '/h3-image-v4-beta4.html', '/mode-manager-v4.js'
        ):
            self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    ThreadingHTTPServer((v3.base.LISTEN_HOST, v3.base.LISTEN_PORT), V4Beta4Handler).serve_forever()
