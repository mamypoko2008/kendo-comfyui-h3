import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import models_v4_beta2

class V4Beta2ModelsTest(unittest.TestCase):
    def test_manifest_contains_upscaler_and_optional_loras(self):
        names = {item[0] for item in models_v4_beta2.MODEL_SPECS}
        self.assertIn('latent_upscale_models/minimax_h3_latent_upscaler_3d_conv_v1_bf16.safetensors', names)
        self.assertIn('loras/h3-realism-people-t2v-i2v-r2v.safetensors', names)
        self.assertIn('loras/minimax-h3-facial-realism-closeup-cp2000.safetensors', names)

    def test_files_ready_uses_exact_sizes(self):
        specs=(('one.bin',3),('two.bin',2))
        with tempfile.TemporaryDirectory() as folder, patch.object(models_v4_beta2,'MODEL_ROOT',folder), patch.object(models_v4_beta2,'MODEL_SPECS',specs):
            Path(folder,'one.bin').write_bytes(b'123')
            Path(folder,'two.bin').write_bytes(b'1')
            self.assertFalse(models_v4_beta2.files_ready())
            Path(folder,'two.bin').write_bytes(b'12')
            self.assertTrue(models_v4_beta2.files_ready())

    def test_all_sources_are_https_huggingface(self):
        for spec in models_v4_beta2.MODEL_SPECS:
            self.assertTrue(models_v4_beta2.model_url(spec).startswith('https://huggingface.co/'))

if __name__ == '__main__':
    unittest.main()
