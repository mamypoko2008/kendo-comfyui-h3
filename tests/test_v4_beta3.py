import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
import models_v4_beta3 as models

class V4Beta3ModelsTest(unittest.TestCase):
    def test_manifest_has_original_video_and_official_image_without_singularity(self):
        names={path for path,_ in models.MODEL_SPECS}
        self.assertIn('diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors',names)
        self.assertIn('diffusion_models/minimax_h3_image_pruned_int8_convrot.safetensors',names)
        self.assertIn('text_encoders/qwen3vl_32b_minimax_h3_int8_convrot.safetensors',names)
        self.assertFalse(any('Singularity' in name for name in names))
        self.assertGreater(sum(size for _,size in models.MODEL_SPECS),90_000_000_000)

    def test_readiness_uses_exact_sizes_per_mode(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(models,'MODEL_ROOT',folder), patch.object(models,'VIDEO_SPECS',(('video.bin',3),)), patch.object(models,'IMAGE_SPECS',(('image.bin',2),)):
            Path(folder,'video.bin').write_bytes(b'123')
            Path(folder,'image.bin').write_bytes(b'1')
            self.assertTrue(models.video_ready())
            self.assertFalse(models.image_ready())
            Path(folder,'image.bin').write_bytes(b'12')
            self.assertTrue(models.image_ready())

    def test_sources_are_official_https_huggingface(self):
        for relative,_ in models.MODEL_SPECS:
            url=models.model_url(relative)
            self.assertTrue(url.startswith('https://huggingface.co/Comfy-Org/MiniMax-H3'))

if __name__=='__main__': unittest.main()
