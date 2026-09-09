"""v2 page entry point, retaining the original proxy implementation."""
import json
import os
from http.server import ThreadingHTTPServer
import page_server_base as base
import models_v2 as models

class V2Handler(base.KendoPageHandler):
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
            progress=round(downloaded * 100 / total, 1), version='2.0.0')).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        if include_body:
            self.wfile.write(payload)

if __name__ == '__main__':
    ThreadingHTTPServer((base.LISTEN_HOST, base.LISTEN_PORT), V2Handler).serve_forever()
