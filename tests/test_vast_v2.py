import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class VastV2ImageTest(unittest.TestCase):
    def test_vast_image_is_separate_from_runpod_v2(self):
        dockerfile = (ROOT / 'Dockerfile.vast-v2').read_text()
        self.assertIn('kendo-comfyui-h3:v2.1.2', dockerfile)
        self.assertIn('ENTRYPOINT ["/opt/kendo/entrypoint-vast-v2.sh"]', dockerfile)
        self.assertIn('EXPOSE 3000 8188', dockerfile)

    def test_vast_entrypoint_does_not_delegate_to_runpod(self):
        entrypoint = (ROOT / 'scripts' / 'entrypoint-vast-v2.sh').read_text()
        self.assertNotIn('exec /start.sh', entrypoint)
        self.assertIn('main.py', entrypoint)
        self.assertIn('--listen 0.0.0.0', entrypoint)
        self.assertIn('KENDO_ENABLE_SAGE:-auto', entrypoint)
        self.assertIn('torch.cuda.is_available()', entrypoint)

    def test_vast_tag_does_not_trigger_standard_v2_build(self):
        standard = (ROOT / '.github' / 'workflows' / 'build-v2.yml').read_text()
        vast = (ROOT / '.github' / 'workflows' / 'build-vast-v2.yml').read_text()
        self.assertIn("- 'v2.*'", standard)
        self.assertIn("- 'vast-v2.*'", vast)


if __name__ == '__main__':
    unittest.main()
