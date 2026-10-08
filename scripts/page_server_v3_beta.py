"""v3 beta page entry point: v2 status plus the Claude MCP connection details."""
import http.client
import json
import os
from http.server import ThreadingHTTPServer
from urllib.parse import quote, urlsplit
try:
    import page_server_base as base
except ModuleNotFoundError:
    import page_server as base
import models_v3_beta as models

VERSION = '3.0.0-beta.15'
MCP_BIND_HOST = os.environ.get('KENDO_MCP_HOST', '127.0.0.1')
MCP_HOST = '127.0.0.1' if MCP_BIND_HOST in ('0.0.0.0', '::') else MCP_BIND_HOST
MCP_PORT = int(os.environ.get('KENDO_MCP_PORT', '3001'))
COMFY_PORT = int(os.environ.get('KENDO_COMFY_PORT', '8188'))
MCP_CODE_FILE = os.environ.get('KENDO_MCP_CODE_FILE', '/workspace/.kendo-mcp-code')
LOG_PATH = '/api/kendo/logs'
COMFY_LOG_FILE = os.environ.get('KENDO_COMFY_LOG_FILE', '')
GPU_LOG_FILE = os.environ.get('KENDO_GPU_LOG_FILE', '')
RUNTIME_FILE = os.environ.get('KENDO_RUNTIME_FILE', '/workspace/kendo-runtime.json')
MAX_LOG_BYTES = 192 * 1024

def mcp_code():
    code = os.environ.get('KENDO_MCP_CODE', '').strip()
    if code:
        return code
    try:
        with open(MCP_CODE_FILE, encoding='utf-8') as stream:
            return stream.read().strip() or None
    except OSError:
        return None

def mcp_url():
    """Streamable HTTP URL: public proxy on RunPod, loopback on Local."""
    pod = os.environ.get('RUNPOD_POD_ID', '').strip()
    code = mcp_code()
    if not code:
        return None
    explicit = os.environ.get('KENDO_MCP_PUBLIC_URL', '').strip()
    if explicit:
        return explicit.replace('{code}', quote(code, safe=''))
    if pod:
        return f'https://{pod}-{MCP_PORT}.proxy.runpod.net/mcp/{quote(code, safe="")}'
    return f'http://127.0.0.1:{MCP_PORT}/mcp/{quote(code, safe="")}'

def comfy_url():
    pod = os.environ.get('RUNPOD_POD_ID', '').strip()
    if pod:
        return f'https://{pod}-{COMFY_PORT}.proxy.runpod.net/'
    return f'http://127.0.0.1:{COMFY_PORT}/'

def runtime_status():
    try:
        with open(RUNTIME_FILE, encoding='utf-8') as stream:
            return json.load(stream)
    except (OSError, ValueError):
        return {'attention': 'กำลังตรวจสอบ', 'gpu': {'name': 'กำลังตรวจสอบ'},
                'sage': {'active': False, 'reason': 'runtime probe pending'}}

class V3Handler(base.KendoPageHandler):
    def end_headers(self):
        path = urlsplit(self.path).path
        if path in ('/v3-beta.html', '/v3-beta.js', '/workflow-v3-beta.js', '/runtime-v4-local.js'):
            self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_GET(self):
        if urlsplit(self.path).path == LOG_PATH:
            self._send_comfy_logs()
            return
        super().do_GET()

    def _send_comfy_logs(self):
        text = ''
        available = False
        if COMFY_LOG_FILE:
            try:
                with open(COMFY_LOG_FILE, 'rb') as stream:
                    stream.seek(0, os.SEEK_END)
                    size = stream.tell()
                    stream.seek(max(0, size - MAX_LOG_BYTES))
                    data = stream.read(MAX_LOG_BYTES)
                text = data.decode('utf-8', errors='replace')
                if size > MAX_LOG_BYTES:
                    text = '… แสดงเฉพาะ Log ล่าสุด …\n' + text
                available = True
            except OSError:
                pass
        gpu_text = ''
        if GPU_LOG_FILE:
            try:
                with open(GPU_LOG_FILE, 'rb') as stream:
                    stream.seek(0, os.SEEK_END)
                    size = stream.tell()
                    stream.seek(max(0, size - 8192))
                    gpu_text = stream.read(8192).decode('utf-8', errors='replace')
            except OSError:
                pass
        payload = json.dumps({'available': available, 'text': text, 'gpu_text': gpu_text}).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _mcp_ready(self):
        connection = http.client.HTTPConnection(MCP_HOST, MCP_PORT, timeout=2)
        try:
            connection.request('GET', '/healthz', headers={'Connection': 'close'})
            return connection.getresponse().status == 200
        except (ConnectionError, TimeoutError, OSError, http.client.HTTPException):
            return False
        finally:
            connection.close()

    def _send_kendo_status(self, include_body=True):
        total = sum(size for _, size in models.MODEL_SPECS)
        downloaded = 0
        for relative, size in models.MODEL_SPECS:
            target = os.path.join(models.MODEL_ROOT, relative)
            candidate = target if os.path.isfile(target) else target + '.part'
            try:
                downloaded += min(os.path.getsize(candidate), size)
            except OSError:
                pass
        try:
            with open(models.ERROR_FILE, encoding='utf-8') as stream:
                error = stream.read()
        except OSError:
            error = None
        payload = json.dumps(dict(models_ready=models.files_ready(), comfy_ready=self._comfy_ready(),
            download_error=error, downloaded_bytes=downloaded, total_bytes=total,
            progress=round(downloaded * 100 / total, 1), version=VERSION,
            mcp_ready=self._mcp_ready(), mcp_url=mcp_url(),
            comfy_url=comfy_url(), runtime=runtime_status())).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        if include_body:
            self.wfile.write(payload)

if __name__ == '__main__':
    ThreadingHTTPServer((base.LISTEN_HOST, base.LISTEN_PORT), V3Handler).serve_forever()
