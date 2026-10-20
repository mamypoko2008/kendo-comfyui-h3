import json
import unittest
from pathlib import Path


ROOT = Path(__file__).parents[1]


class VastV3PackagingTests(unittest.TestCase):
    def test_image_is_versioned_and_separate_from_runpod_and_vast_v2(self):
        dockerfile = (ROOT / 'Dockerfile.vast-v3').read_text(encoding='utf-8')
        self.assertIn('v3.0.0-beta.15', dockerfile)
        self.assertIn('KENDO_IMAGE_VERSION=vast-v3.0.0-beta.15-1', dockerfile)
        self.assertIn('ENTRYPOINT ["/opt/kendo/entrypoint-vast-v3.sh"]', dockerfile)
        self.assertNotIn('Dockerfile.vast-v2', dockerfile)

    def test_entrypoint_is_portable_and_starts_v3_services(self):
        entrypoint = (ROOT / 'scripts' / 'entrypoint-vast-v3.sh').read_text(encoding='utf-8')
        self.assertNotIn('exec /start.sh', entrypoint)
        self.assertIn('detect_runpod_runtime.py', entrypoint)
        self.assertIn('/opt/kendo-mcp/server.mjs', entrypoint)
        self.assertIn('page_server_vast_v3.py', entrypoint)
        self.assertIn('VAST_TCP_PORT_3000', entrypoint)
        self.assertIn('VAST_TCP_PORT_3001', entrypoint)
        self.assertIn('VAST_TCP_PORT_8188', entrypoint)
        self.assertIn('--listen 0.0.0.0', entrypoint)

    def test_vast_page_adapter_uses_assigned_public_ports(self):
        adapter = (ROOT / 'scripts' / 'page_server_vast_v3.py').read_text(encoding='utf-8')
        self.assertIn("PUBLIC_IPADDR", adapter)
        self.assertIn("VAST_TCP_PORT_", adapter)
        self.assertIn("KENDO_MCP_PUBLIC_URL", adapter)
        self.assertIn("KENDO_COMFY_PUBLIC_URL", adapter)

    def test_template_reuses_old_v3_identity_without_locking_gpu_name(self):
        template = json.loads((ROOT / 'vast-v3-template.json').read_text(encoding='utf-8'))
        self.assertEqual(template['hash_id'], '41ab82321bd133582ecf2ab0a25805bd')
        self.assertEqual(template['tag'], 'vast-v3.0.0-beta.15-1')
        self.assertEqual(template['runtype'], 'args')
        self.assertEqual(template['recommended_disk_space'], 100)
        self.assertNotIn('gpu_name', template['extra_filters'])
        self.assertEqual(template['extra_filters']['gpu_ram']['gte'], 30000)
        self.assertIn('-p 3001:3001', template['env'])


if __name__ == '__main__':
    unittest.main()
