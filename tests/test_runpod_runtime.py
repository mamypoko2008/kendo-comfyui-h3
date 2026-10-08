import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock


SCRIPT = Path(__file__).parents[1] / 'scripts' / 'detect_runpod_runtime.py'


def load_module():
    spec = importlib.util.spec_from_file_location('detect_runpod_runtime', SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class RunpodRuntimeTests(unittest.TestCase):
    def run_probe(self, gpu, sage):
        module = load_module()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            module.ARGS_FILE = root / 'comfyui_args.txt'
            module.RUNTIME_FILE = root / 'runtime.json'
            module.ARGS_FILE.write_text('--enable-cors-header\n--use-sage-attention\n', encoding='utf-8')
            with mock.patch.object(module, 'gpu_details', return_value=gpu), \
                    mock.patch.object(module, 'sage_import', return_value=sage), \
                    mock.patch.dict(os.environ, {'KENDO_ENABLE_SAGE': '1', 'KENDO_IMAGE_VERSION': 'test'}, clear=False):
                module.main()
            return json.loads(module.RUNTIME_FILE.read_text(encoding='utf-8')), module.ARGS_FILE.read_text(encoding='utf-8')

    def test_enables_sage_for_5090_sm120(self):
        runtime, args = self.run_probe(
            {'name': 'NVIDIA GeForce RTX 5090', 'vram_gb': 31.8, 'compute_capability': '12.0', 'driver': '580'},
            (True, '2.2.0', None),
        )
        self.assertTrue(runtime['sage']['active'])
        self.assertEqual(args.count('--use-sage-attention'), 1)
        self.assertEqual(runtime['attention'], 'Sage Global · ACTIVE')

    def test_enables_sage_for_rtx_pro_6000_sm120(self):
        runtime, args = self.run_probe(
            {'name': 'NVIDIA RTX PRO 6000 Blackwell', 'vram_gb': 95.6, 'compute_capability': '12.0', 'driver': '580'},
            (True, '2.2.0', None),
        )
        self.assertTrue(runtime['sage']['active'])
        self.assertIn('--use-sage-attention', args)

    def test_falls_back_and_removes_flag_when_incompatible(self):
        runtime, args = self.run_probe(
            {'name': 'NVIDIA GeForce RTX 4090', 'vram_gb': 24.0, 'compute_capability': '8.9', 'driver': '580'},
            (True, '2.2.0', None),
        )
        self.assertFalse(runtime['sage']['active'])
        self.assertNotIn('--use-sage-attention', args)
        self.assertIn('not sm_120', runtime['sage']['reason'])

    def test_falls_back_when_import_fails(self):
        runtime, args = self.run_probe(
            {'name': 'NVIDIA GeForce RTX 5090', 'vram_gb': 31.8, 'compute_capability': '12.0', 'driver': '580'},
            (False, None, 'ImportError: missing kernel'),
        )
        self.assertFalse(runtime['sage']['active'])
        self.assertNotIn('--use-sage-attention', args)
        self.assertEqual(runtime['sage']['reason'], 'ImportError: missing kernel')


if __name__ == '__main__':
    unittest.main()
