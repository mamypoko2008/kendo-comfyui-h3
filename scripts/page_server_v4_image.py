"""V3 page service plus read-only native Qwen model download status."""
import json
from pathlib import Path
from urllib.parse import urlsplit
from http.server import ThreadingHTTPServer
import page_server_v3_beta as v3
import download_image_models as qwen

IMAGE_ERROR_FILE = Path('/workspace/.kendo-qwen-v4-error')


def image_status(root=None):
    model_root = Path(root or v3.models.MODEL_ROOT)
    specs = qwen.selected_specs('qwen21')
    total = sum(size for _, size in specs)
    downloaded, missing = 0, []
    for relative, expected in specs:
        target = model_root / relative
        try:
            size = target.stat().st_size
        except OSError:
            size = 0
        if size != expected:
            missing.append(relative)
        if not size:
            try:
                size = target.with_name(target.name + '.part').stat().st_size
            except OSError:
                pass
        downloaded += min(size, expected)
    try:
        error = IMAGE_ERROR_FILE.read_text(encoding='utf-8')
    except OSError:
        error = None
    return dict(model='qwen21', files_ready=not missing, missing_files=missing,
                downloaded_bytes=downloaded, total_bytes=total,
                progress=round(downloaded * 100 / total, 1), download_error=error)


class V4ImageHandler(v3.V3Handler):
    def do_GET(self):
        if urlsplit(self.path).path == '/api/kendo/image-status':
            payload = json.dumps(image_status()).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(payload)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(payload)
            return
        super().do_GET()

    def end_headers(self):
        if urlsplit(self.path).path in ('/', '/index.html', '/v4-image.html', '/v4-image.js', '/images-v4.html', '/images-v4.js', '/images-v4.css', '/workflow-qwen-v4.js', '/workflow-video-v4-image.js'):
            self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    ThreadingHTTPServer((v3.base.LISTEN_HOST, v3.base.LISTEN_PORT), V4ImageHandler).serve_forever()
