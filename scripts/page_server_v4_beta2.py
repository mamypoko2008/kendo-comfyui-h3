"""V4 beta.2 page/status wrapper over the stable V3 proxy and MCP surface."""
import sys
from http.server import ThreadingHTTPServer
from urllib.parse import urlsplit
import models_v4_beta2 as v4_models

# The stable handler imports this module name. Substitute the V4 manifest before
# importing it so readiness/progress includes the upscaler and optional LoRAs.
sys.modules['models_v3_beta'] = v4_models
import page_server_v3_beta as v3

v3.VERSION = '4.0.0-beta.2'
v3.models = v4_models

class V4Beta2Handler(v3.V3Handler):
    def end_headers(self):
        path = urlsplit(self.path).path
        if path in ('/v4-beta2.html', '/v4-beta2.css', '/v4-beta2-ui.js', '/workflow-v4-beta2.js'):
            self.send_header('Cache-Control', 'no-store')
        super().end_headers()

if __name__ == '__main__':
    ThreadingHTTPServer((v3.base.LISTEN_HOST, v3.base.LISTEN_PORT), V4Beta2Handler).serve_forever()
