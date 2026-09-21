import importlib
import json
import http.client
import sys
import tempfile
import threading
import types
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import models_v3_beta
import page_server
sys.modules['page_server_base'] = page_server
import page_server_v3_beta

class V3ReadinessTest(unittest.TestCase):
    def test_old_marker_cannot_mark_missing_ref2va_ready(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(models_v3_beta, 'MODEL_ROOT', folder), patch.object(models_v3_beta, 'MODEL_SPECS', (('ref.bin', 5),)):
            Path(folder, '.kendo-h3-models-ready').touch()
            self.assertFalse(models_v3_beta.files_ready())
            Path(folder, 'ref.bin').write_bytes(b'1234')
            self.assertFalse(models_v3_beta.files_ready())
            Path(folder, 'ref.bin').write_bytes(b'12345')
            self.assertTrue(models_v3_beta.files_ready())

    def test_status_matches_v2_manifest_without_ready_marker(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(models_v3_beta, 'MODEL_ROOT', folder), patch.object(models_v3_beta, 'MODEL_SPECS', (('ref.bin', 5),)), patch.object(models_v3_beta, 'ERROR_FILE', str(Path(folder, 'error'))), patch.object(page_server_v3_beta.V3Handler, '_comfy_ready', return_value=True):
            Path(folder, 'ref.bin').write_bytes(b'12345')
            server = page_server_v3_beta.ThreadingHTTPServer(('127.0.0.1', 0), page_server_v3_beta.V3Handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                conn = http.client.HTTPConnection('127.0.0.1', server.server_port)
                conn.request('GET', '/api/kendo/status')
                result = json.loads(conn.getresponse().read())
                conn.close()
                self.assertTrue(result['models_ready'])
                self.assertEqual(result['version'], '3.0.0-beta.12')
                self.assertEqual(result['progress'], 100)
                self.assertEqual(result['total_bytes'], 5)
            finally:
                server.shutdown(); server.server_close()

class DownloadTest(unittest.TestCase):
    def setUp(self):
        # Only the Linux flock import is stubbed on Windows; no GPU required.
        with patch.dict(sys.modules, {'fcntl': types.SimpleNamespace()}):
            self.downloader = importlib.import_module('download_models_v3_beta')

    def test_reuses_existing_file_without_network(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(self.downloader, 'MODEL_ROOT', folder), patch.object(self.downloader.subprocess, 'run') as run:
            Path(folder, 'model').write_bytes(b'12345')
            self.downloader.download('model', 5)
            run.assert_not_called()

    def test_resume_uses_existing_partial_and_promotes_completed_file(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(self.downloader, 'MODEL_ROOT', folder):
            partial = Path(folder, 'model.part'); partial.write_bytes(b'12')
            def complete(args, check):
                self.assertIn('--continue=true', args)
                self.assertEqual(partial.read_bytes(), b'12')
                partial.write_bytes(b'12345')
            with patch.object(self.downloader.subprocess, 'run', side_effect=complete):
                self.downloader.download('model', 5)
            self.assertEqual(Path(folder, 'model').read_bytes(), b'12345')
            self.assertFalse(partial.exists())

    def test_incomplete_result_is_not_promoted(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(self.downloader, 'MODEL_ROOT', folder), patch.object(self.downloader.subprocess, 'run'):
            Path(folder, 'model.part').write_bytes(b'12')
            with self.assertRaises(RuntimeError): self.downloader.download('model', 5)
            self.assertFalse(Path(folder, 'model').exists())

class ClaudeConnectionTest(unittest.TestCase):
    def _status(self, env):
        with tempfile.TemporaryDirectory() as folder, patch.object(models_v3_beta, 'MODEL_ROOT', folder), patch.object(models_v3_beta, 'MODEL_SPECS', (('ref.bin', 5),)), patch.object(models_v3_beta, 'ERROR_FILE', str(Path(folder, 'error'))), patch.object(page_server_v3_beta.V3Handler, '_comfy_ready', return_value=True), patch.object(page_server_v3_beta.V3Handler, '_mcp_ready', return_value=True), patch.dict(page_server_v3_beta.os.environ, {k: v for k, v in env.items() if k != 'code_file'}, clear=False), patch.object(page_server_v3_beta, 'MCP_CODE_FILE', str(Path(folder, 'code'))):
            if 'code_file' in env:
                Path(folder, 'code').write_text(env['code_file'] + '\n')
            server = page_server_v3_beta.ThreadingHTTPServer(('127.0.0.1', 0), page_server_v3_beta.V3Handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                conn = http.client.HTTPConnection('127.0.0.1', server.server_port)
                conn.request('GET', '/api/kendo/status')
                result = json.loads(conn.getresponse().read())
                conn.close()
                return result
            finally:
                server.shutdown(); server.server_close()

    def test_status_publishes_claude_url_from_pod_id_and_code_file(self):
        result = self._status({'RUNPOD_POD_ID': 'abc123', 'KENDO_MCP_CODE': '', 'code_file': 'kendo-deadbeef'})
        self.assertEqual(result['mcp_url'], 'https://abc123-3001.proxy.runpod.net/mcp/kendo-deadbeef')
        self.assertTrue(result['mcp_ready'])
        self.assertEqual(result['version'], '3.0.0-beta.12')

    def test_env_code_wins_and_missing_pod_id_hides_url(self):
        self.assertEqual(self._status({'RUNPOD_POD_ID': 'abc123', 'KENDO_MCP_CODE': 'kendo-env', 'code_file': 'kendo-file'})['mcp_url'], 'https://abc123-3001.proxy.runpod.net/mcp/kendo-env')
        self.assertIsNone(self._status({'RUNPOD_POD_ID': '', 'KENDO_MCP_CODE': 'kendo-env'})['mcp_url'])
