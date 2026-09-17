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
    def test_model_readiness_requires_h3_and_realism_lora(self):
        specs = (('base.bin', 4, 'base-url'), ('realism.safetensors', 3, 'lora-url'))
        with tempfile.TemporaryDirectory() as folder, \
                patch.object(models_v3_beta, 'MODEL_ROOT', folder), \
                patch.object(models_v3_beta, 'BASE_MODEL_SPECS', specs), \
                patch.object(models_v3_beta, 'MODEL_SPECS', specs):
            Path(folder, 'base.bin').write_bytes(b'1234')
            self.assertFalse(models_v3_beta.files_ready())
            Path(folder, 'realism.safetensors').write_bytes(b'123')
            self.assertTrue(models_v3_beta.files_ready())

    def test_realism_lora_manifest_is_pinned(self):
        spec = next(item for item in models_v3_beta.MODEL_SPECS if 'realism-people' in item[0])
        self.assertEqual(spec[1], 131229656)
        self.assertIn('fal/MiniMax-H3-Realism-People-LoRA', spec[2])

    def test_status_exposes_beta10_version(self):
        specs = (('base.bin', 4, 'base-url'),)
        with tempfile.TemporaryDirectory() as folder, \
                patch.object(models_v3_beta, 'MODEL_ROOT', folder), \
                patch.object(models_v3_beta, 'MODEL_SPECS', specs), \
                patch.object(models_v3_beta, 'BASE_MODEL_SPECS', specs), \
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
                self.assertTrue(result['models_ready'])
                self.assertTrue(result['comfy_ready'])
                self.assertEqual(result['version'], '3.0.0-beta.10')
            finally:
                server.shutdown(); server.server_close()

    def test_entrypoint_uses_kjnodes_and_removes_global_sage_flag(self):
        root = Path(__file__).resolve().parents[1]
        script = (root / 'scripts' / 'entrypoint-v3-beta.sh').read_text()
        restore = script.index('cp -a "$baked_dir/." "$comfyui_dir/"')
        link_target = script.index('for node_name in ComfyUI-KJNodes')
        self.assertLess(restore, link_target)
        self.assertIn("sed -i '/^--use-sage-attention$/d'", script)
        self.assertIn('ComfyUI-SeedVR2_VideoUpscaler', script)
        dockerfile = (root / 'Dockerfile.v3-beta').read_text()
        self.assertIn('kijai/ComfyUI-KJNodes', dockerfile)
        self.assertIn('d3cfe21625e5170126ce06fbfcfe1d88108688c3', dockerfile)
        self.assertNotIn('numz/ComfyUI-SeedVR2', dockerfile)


if __name__ == '__main__':
    unittest.main()
