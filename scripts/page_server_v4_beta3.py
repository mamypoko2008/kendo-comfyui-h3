"""V3-compatible Page plus native MiniMax H3 Image readiness."""
import json
import os
from http.server import ThreadingHTTPServer
from urllib.parse import urlsplit
import page_server_v3_beta as v3
import models_v4_beta3 as models

v3.models = models

def progress(specs):
    downloaded = 0
    missing = []
    for relative, expected in specs:
        target = os.path.join(models.MODEL_ROOT, relative)
        size = 0
        try:
            size = os.path.getsize(target)
        except OSError:
            try:
                size = os.path.getsize(target + '.part')
            except OSError:
                pass
        downloaded += min(size, expected)
        if size != expected:
            missing.append(relative)
    total = sum(size for _, size in specs)
    return dict(files_ready=not missing, missing_files=missing, downloaded_bytes=downloaded,
                total_bytes=total, progress=round(downloaded * 100 / total, 1))

class V4Beta3Handler(v3.V3Handler):
    def do_GET(self):
        if urlsplit(self.path).path == '/api/kendo/image-status':
            payload = progress(models.IMAGE_SPECS)
            payload['model'] = 'h3image'
            try:
                with open(models.ERROR_FILE, encoding='utf-8') as stream:
                    payload['download_error'] = stream.read()
            except OSError:
                payload['download_error'] = None
            data = json.dumps(payload).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        super().do_GET()

    def end_headers(self):
        if urlsplit(self.path).path in ('/','/index.html','/v4-beta3.html','/h3-image.html','/v4-beta3.js','/h3-image.js','/workflow-h3-image.js'):
            self.send_header('Cache-Control', 'no-store')
        super().end_headers()

if __name__ == '__main__':
    ThreadingHTTPServer((v3.base.LISTEN_HOST, v3.base.LISTEN_PORT), V4Beta3Handler).serve_forever()
