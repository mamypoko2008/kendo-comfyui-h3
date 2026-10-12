import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))
import download_models_v4_image as installer
import page_server_v4_image as page


class V4ImageTest(unittest.TestCase):
    def test_download_budget_reuses_complete_models_and_resumable_partials(self):
        with tempfile.TemporaryDirectory() as folder:
            Path(folder, 'complete').write_bytes(b'12345')
            Path(folder, 'resumed.part').write_bytes(b'123')
            Path(folder, 'broken').write_bytes(b'x')
            specs = [('complete', 5), ('resumed', 8), ('broken', 4)]
            self.assertEqual(installer.remaining_bytes(folder, specs), 9)
            with patch.object(installer.shutil, 'disk_usage') as usage:
                usage.return_value.free = installer.RESERVE + 8
                with self.assertRaisesRegex(RuntimeError, 'Not enough'):
                    installer.ensure_space(folder, specs)
                usage.return_value.free = installer.RESERVE + 9
                installer.ensure_space(folder, specs)

    def test_image_status_requires_complete_files_not_just_a_ready_marker(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(page.qwen, 'selected_specs', return_value=[('image.bin', 5)]), patch.object(page, 'IMAGE_ERROR_FILE', Path(folder, 'error')):
            Path(folder, 'image.bin.part').write_bytes(b'123')
            state = page.image_status(folder)
            self.assertFalse(state['files_ready']);self.assertEqual(state['progress'], 60)
            Path(folder, 'image.bin').write_bytes(b'12345')
            state = page.image_status(folder)
            self.assertTrue(state['files_ready']);self.assertEqual(state['missing_files'], [])

    def test_separate_image_variant_keeps_v3_config_and_uses_single_mcp(self):
        spec = json.loads((ROOT / 'runpod-v4-image.json').read_text(encoding='utf-8'))
        old = json.loads((ROOT / 'runpod-v3-beta.json').read_text(encoding='utf-8'))
        self.assertEqual(spec['ports'], old['ports'])
        self.assertEqual(spec['volumeMountPath'], '/workspace')
        self.assertEqual(spec['env']['KENDO_IMAGE_DEFAULT_MODEL'], 'qwen21')
        docker = (ROOT / 'Dockerfile.v4-image').read_text()
        self.assertIn('KENDO_ENABLE_IMAGES=1', docker)
        self.assertIn('KENDO_IMAGE_MODELS=""', docker)
        self.assertIn('page_server_v4_image.py', docker)
        self.assertIn('workflow-qwen-v4.js', docker)


if __name__ == '__main__':
    unittest.main()
