import http.client
import json
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import models_v3_beta
import page_server
sys.modules['page_server_base'] = page_server
import page_server_v3_beta


class V3BetaReadinessTest(unittest.TestCase):
    def test_base_and_upscale_readiness_are_independent(self):
        with tempfile.TemporaryDirectory() as folder, \
                patch.object(models_v3_beta, 'MODEL_ROOT', folder), \
                patch.object(models_v3_beta, 'BASE_MODEL_SPECS', (('base.bin', 4, 'base-url'),)), \
                patch.object(models_v3_beta, 'FAST_UPSCALE_MODEL_SPECS', (('fast.bin', 2, 'fast-url'),)), \
                patch.object(models_v3_beta, 'QUALITY_UPSCALE_MODEL_SPECS', (('quality.bin', 3, 'quality-url'),)), \
                patch.object(models_v3_beta, 'UPSCALE_MODEL_SPECS', (('fast.bin', 2, 'fast-url'), ('quality.bin', 3, 'quality-url'))):
            Path(folder, 'base.bin').write_bytes(b'1234')
            self.assertTrue(models_v3_beta.base_files_ready())
            self.assertFalse(models_v3_beta.upscale_files_ready())
            self.assertFalse(models_v3_beta.files_ready())
            Path(folder, 'fast.bin').write_bytes(b'12')
            self.assertTrue(models_v3_beta.fast_upscale_files_ready())
            self.assertFalse(models_v3_beta.quality_upscale_files_ready())
            Path(folder, 'quality.bin').write_bytes(b'123')
            self.assertTrue(models_v3_beta.files_ready())

    def test_status_exposes_partial_readiness_and_beta_version(self):
        specs = (('base.bin', 4, 'base-url'), ('fast.bin', 2, 'fast-url'), ('quality.bin', 3, 'quality-url'))
        with tempfile.TemporaryDirectory() as folder, \
                patch.object(models_v3_beta, 'MODEL_ROOT', folder), \
                patch.object(models_v3_beta, 'MODEL_SPECS', specs), \
                patch.object(models_v3_beta, 'BASE_MODEL_SPECS', specs[:1]), \
                patch.object(models_v3_beta, 'FAST_UPSCALE_MODEL_SPECS', specs[1:2]), \
                patch.object(models_v3_beta, 'QUALITY_UPSCALE_MODEL_SPECS', specs[2:]), \
                patch.object(models_v3_beta, 'UPSCALE_MODEL_SPECS', specs[1:]), \
                patch.object(models_v3_beta, 'ERROR_FILE', str(Path(folder, 'error'))), \
                patch.object(page_server_v3_beta.V3BetaHandler, '_comfy_ready', return_value=True):
            Path(folder, 'base.bin').write_bytes(b'1234')
            server = page_server_v3_beta.ThreadingHTTPServer(('127.0.0.1', 0), page_server_v3_beta.V3BetaHandler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                conn = http.client.HTTPConnection('127.0.0.1', server.server_port)
                conn.request('GET', '/api/kendo/status')
                result = json.loads(conn.getresponse().read())
                conn.close()
                self.assertTrue(result['base_models_ready'])
                self.assertFalse(result['upscale_models_ready'])
                self.assertFalse(result['fast_upscale_ready'])
                self.assertFalse(result['quality_upscale_ready'])
                self.assertFalse(result['models_ready'])
                self.assertEqual(result['version'], '3.0.0-beta.5')
            finally:
                server.shutdown()
                server.server_close()

    def test_entrypoint_restores_comfy_before_linking_seedvr2(self):
        script = (Path(__file__).resolve().parents[1] / 'scripts' / 'entrypoint-v3-beta.sh').read_text()
        restore = script.index('cp -a "$baked_dir/." "$comfyui_dir/"')
        link_target = script.index('node_target="$comfyui_dir/custom_nodes/ComfyUI-SeedVR2_VideoUpscaler"')
        self.assertLess(restore, link_target)
        self.assertIn('[[ ! -f "$comfyui_dir/main.py" ]]', script)
        self.assertIn('if [[ -L "$old_flash" ]]', script)


if __name__ == '__main__':
    unittest.main()
