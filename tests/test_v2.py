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
import models_v2
import page_server
sys.modules['page_server_base'] = page_server
import page_server_v2

class V2ReadinessTest(unittest.TestCase):
    def test_old_marker_cannot_mark_missing_ref2va_ready(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(models_v2, 'MODEL_ROOT', folder), patch.object(models_v2, 'MODEL_SPECS', (('ref.bin', 5),)):
            Path(folder, '.kendo-h3-models-ready').touch()
            self.assertFalse(models_v2.files_ready())
            Path(folder, 'ref.bin').write_bytes(b'1234')
            self.assertFalse(models_v2.files_ready())
            Path(folder, 'ref.bin').write_bytes(b'12345')
            self.assertTrue(models_v2.files_ready())

    def test_status_matches_v2_manifest_without_ready_marker(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(models_v2, 'MODEL_ROOT', folder), patch.object(models_v2, 'MODEL_SPECS', (('ref.bin', 5),)), patch.object(models_v2, 'ERROR_FILE', str(Path(folder, 'error'))), patch.object(page_server_v2.V2Handler, '_comfy_ready', return_value=True):
            Path(folder, 'ref.bin').write_bytes(b'12345')
            server = page_server_v2.ThreadingHTTPServer(('127.0.0.1', 0), page_server_v2.V2Handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                conn = http.client.HTTPConnection('127.0.0.1', server.server_port)
                conn.request('GET', '/api/kendo/status')
                result = json.loads(conn.getresponse().read())
                conn.close()
                self.assertTrue(result['models_ready'])
                self.assertEqual(result['version'], '2.1.0')
                self.assertEqual(result['progress'], 100)
                self.assertEqual(result['total_bytes'], 5)
            finally:
                server.shutdown(); server.server_close()

class DownloadTest(unittest.TestCase):
    def setUp(self):
        # Only the Linux flock import is stubbed on Windows; no GPU required.
        with patch.dict(sys.modules, {'fcntl': types.SimpleNamespace()}):
            self.downloader = importlib.import_module('download_models_v2')

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
