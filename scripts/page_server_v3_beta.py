"""v3 beta page entry point: v2 status plus the Claude MCP connection details."""
import http.client
import json
import os
from http.server import ThreadingHTTPServer
import page_server_base as base
import models_v3_beta as models

VERSION = '3.0.0-beta.12'
MCP_HOST = os.environ.get('KENDO_MCP_HOST', '127.0.0.1')
MCP_PORT = int(os.environ.get('KENDO_MCP_PORT', '3001'))
MCP_CODE_FILE = os.environ.get('KENDO_MCP_CODE_FILE', '/workspace/.kendo-mcp-code')

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
    """Public Streamable HTTP URL students paste into Claude; None outside RunPod."""
    pod = os.environ.get('RUNPOD_POD_ID', '').strip()
    code = mcp_code()
    if not pod or not code:
        return None
    return f'https://{pod}-{MCP_PORT}.proxy.runpod.net/mcp/{code}'

class V3Handler(base.KendoPageHandler):
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
            mcp_ready=self._mcp_ready(), mcp_url=mcp_url())).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        if include_body:
            self.wfile.write(payload)

if __name__ == '__main__':
    ThreadingHTTPServer((base.LISTEN_HOST, base.LISTEN_PORT), V3Handler).serve_forever()
