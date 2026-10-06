"""V4 ingress, aspect/frame preservation, queueing and durable outputs."""
import hashlib
import http.client
import json
import sys
import tempfile
import threading
import types
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
sys.path.insert(0, str(ROOT / 'custom_nodes' / 'kendo_v4'))
import media_v4 as media
import ltx_models_v4 as models
import page_server_v4 as service
from upscale_workflow_v4 import build_workflow

META = dict(width=1080, height=1920, display_width=1080, display_height=1920,
            orientation='portrait', fps=24, fps_fraction='24', frame_count=120,
            duration=5, has_audio=True)

class MediaTests(unittest.TestCase):
    def test_actual_aspect_and_frame_padding(self):
        for w, h, target in [(1920,1080,(3840,2160)), (1080,1920,(2160,3840)),
                              (1024,1024,(3840,3840)), (1920,1088,(3840,2176))]:
            size = media.geometry(dict(display_width=w, display_height=h), '4K')
            self.assertEqual((size['target_width'], size['target_height']), target)
            self.assertLess(abs(size['target_width']/size['target_height'] - w/h), .002)
            self.assertEqual(size['canvas_width'] % 32, 0)
            self.assertEqual(size['canvas_height'] % 32, 0)
            self.assertLess(size['canvas_height'] - size['target_height'], 32)
        for count in (1, 8, 9, 120, 121, 481):
            padded = media.padded_frames(count)
            self.assertGreaterEqual(padded, count)
            self.assertEqual(padded % 8, 1)
        self.assertRaises(ValueError, media.geometry, META, '8K')

    def probe(self, video, audio=True):
        stream = dict(codec_type='video', width=1920, height=1080,
                      avg_frame_rate='24000/1001', sample_aspect_ratio='N/A', nb_read_frames='120')
        stream.update(video)
        data = dict(streams=[stream]
                    + ([dict(codec_type='audio')] if audio else []))
        with patch.object(media.subprocess, 'run', return_value=types.SimpleNamespace(stdout=json.dumps(data).encode())):
            return media.probe('test.mov')

    def test_rotation_sar_and_fractional_fps(self):
        meta = self.probe(dict(side_data_list=[dict(rotation=-90)]))
        self.assertEqual(meta['orientation'], 'portrait')
        self.assertEqual(meta['display_width'], 1080)
        self.assertAlmostEqual(meta['duration'], 5.005)
        self.assertEqual(meta['fps_fraction'], '24000/1001')
        meta = self.probe(dict(avg_frame_rate='0/0', r_frame_rate='30', sample_aspect_ratio='4:3'), False)
        self.assertEqual(meta['display_width'], 2560)
        self.assertFalse(meta['has_audio'])

    def test_path_boundaries_and_unreadable_video(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder) / 'output'; root.mkdir()
            (root / 'good.mp4').write_bytes(b'x')
            self.assertEqual(media.contained_file(root, 'good.mp4'), root / 'good.mp4')
            for filename, sub in [('../good.mp4',''), ('good.mp4','../'), ('C:good.mp4',''), ('missing.mp4','')]:
                self.assertRaises(ValueError, media.contained_file, root, filename, sub)
        self.assertRaises(ValueError, self.probe, dict(nb_read_frames='0'))
        with patch.object(media.subprocess, 'run', side_effect=media.subprocess.TimeoutExpired('ffprobe',180)):
            self.assertRaises(ValueError, media.probe, 'bad.mp4')

    def test_workflow_uses_source_timing_and_removes_padded_tail(self):
        graph = build_workflow('selected.mp4', media.geometry(META, '4K'), seed=123)
        self.assertEqual(graph['fusion']['inputs']['seed'], 123)
        self.assertEqual(graph['fusion']['inputs']['latents'], ['guide', 2])
        self.assertEqual(graph['save']['inputs']['original_frames'], ['source', 3])
        self.assertEqual(graph['save']['inputs']['fps'], ['source', 2])
        self.assertEqual(graph['empty']['inputs']['length'], ['source', 1])
        for node in graph.values():
            for value in node['inputs'].values():
                if isinstance(value, list):
                    self.assertIn(value[0], graph)
        for seed in (True, -1, 2**32, 1.5):
            self.assertRaises(ValueError, build_workflow, 'x.mp4', media.geometry(META,'1080p'), seed=seed)

    def test_official_reference_is_unchanged(self):
        digest = hashlib.sha256((ROOT/'workflows/LTX-2.5_V2V_TiledFusion_Upscale.json').read_bytes()).hexdigest()
        self.assertEqual(digest, '773f258bead45dfd8af68f89e63ca659a58688230bce17f2d93df4819a4b53ea')

    def test_readiness_rejects_partial_and_wrong_size(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(models,'MODEL_ROOT',folder), \
             patch.object(models,'MODEL_SPECS',[('repo','vae/test.bin',10)]), patch.object(models,'ERROR_FILE',folder+'/error'):
            path = Path(folder)/'vae/test.bin'; path.parent.mkdir()
            Path(str(path)+'.part').write_bytes(b'12345')
            self.assertEqual(models.readiness()['progress'],50)
            self.assertFalse(models.readiness()['models_ready'])
            path.write_bytes(b'123456789')
            self.assertFalse(models.readiness()['models_ready'])
            path.write_bytes(b'1234567890')
            self.assertTrue(models.readiness()['models_ready'])

class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.roots = {key:root/key for key in ('INPUT_ROOT','OUTPUT_ROOT','STATE_ROOT')}
        for path in self.roots.values(): path.mkdir()
        (self.roots['OUTPUT_ROOT']/'video').mkdir()
        (self.roots['OUTPUT_ROOT']/'video/clip.mp4').write_bytes(b'original clip')
        self.patches = [patch.object(service,key,value) for key,value in self.roots.items()]
        self.patches += [patch.object(media,'probe',return_value=META.copy()),
                         patch.object(models,'readiness',return_value=dict(models_ready=True,progress=100)),
                         patch.dict(sys.modules, {'psutil':types.SimpleNamespace(virtual_memory=lambda:types.SimpleNamespace(available=10**12))})]
        self.submitted = None; self.complete = False
        def comfy(route,payload=None):
            if route == '/prompt': self.submitted=payload; return dict(prompt_id='job-one')
            if route == '/queue': return dict(queue_running=[] if self.complete else [[1,'job-one']],queue_pending=[])
            if route == '/history/job-one': return {'job-one':dict(status=dict(status_str='success'),outputs={'save':{'videos':[dict(filename='result.mp4',subfolder='video',type='output')]}})}
            if route == '/object_info': return {node['class_type']:{} for node in build_workflow('x.mp4',media.geometry(META,'1080p')).values()}
            raise AssertionError(route)
        self.patches.append(patch.object(service,'comfy',side_effect=comfy))
        for p in self.patches: p.start()
        self.server = service.ThreadingHTTPServer(('127.0.0.1',0),service.V4Handler)
        self.thread = threading.Thread(target=self.server.serve_forever,daemon=True); self.thread.start()
    def tearDown(self):
        self.server.shutdown(); self.server.server_close(); self.thread.join()
        for p in reversed(self.patches): p.stop()
        self.temp.cleanup()
    def request(self,route,body=None,raw=None):
        connection = http.client.HTTPConnection('127.0.0.1',self.server.server_port,timeout=5)
        payload = raw if raw is not None else json.dumps(body).encode() if body is not None else None
        connection.request('POST' if payload is not None else 'GET',route,body=payload,headers={'Content-Type':'application/json'})
        response=connection.getresponse(); status=response.status; data=json.loads(response.read()); connection.close()
        return status,data
    def test_generated_selection_queue_and_durable_result(self):
        self.assertEqual(self.request('/api/kendo/files')[1]['files'][0]['filename'],'clip.mp4')
        status,source=self.request('/api/kendo/upscale/select',dict(filename='clip.mp4',subfolder='video',type='output'))
        self.assertEqual(status,200)
        self.assertEqual(service.source_file(source).read_bytes(), b'original clip')
        self.assertEqual(self.request('/api/kendo/upscale/source/'+source['source_id'])[1],source)
        status,job=self.request('/api/kendo/upscale',dict(source_id=source['source_id'],preset='4K',seed=999))
        self.assertEqual(status,202)
        self.assertEqual((job['target_width'],job['target_height']),(2160,3840))
        self.assertEqual(self.submitted['prompt']['source']['inputs']['video'],source['video'])
        self.assertEqual(self.request('/api/kendo/upscale/job/job-one')[1]['status'],'running')
        self.complete=True; (self.roots['OUTPUT_ROOT']/'video/result.mp4').write_bytes(b'refined')
        self.assertEqual(self.request('/api/kendo/upscale/job/job-one')[1]['status'],'done')
        with patch.object(service,'comfy',side_effect=OSError('Comfy restarted')):
            self.assertEqual(self.request('/api/kendo/upscale/job/job-one')[1]['status'],'done')
        self.assertEqual(self.request('/api/kendo/upscale/jobs')[1]['jobs'][0]['job_id'],'job-one')
    def test_upload_invalid_file_cleanup_and_readiness(self):
        status,source=self.request('/api/kendo/upscale/upload?name=phone.mov',raw=b'upload')
        self.assertEqual(status,201); self.assertEqual(source['source_kind'],'upload')
        self.assertEqual(service.source_file(source).read_bytes(),b'upload')
        self.assertTrue(self.request('/api/kendo/upscale/status')[1]['nodes_ready'])
        with patch.object(service,'comfy',return_value={'LTXVTiledFusionSampler':{}}):
            readiness=self.request('/api/kendo/upscale/status')[1]
            self.assertFalse(readiness['nodes_ready']); self.assertIn('KendoLTXLoadVideo',readiness['missing_nodes'])
        with patch.object(media,'probe',side_effect=ValueError('bad video')):
            self.assertEqual(self.request('/api/kendo/upscale/upload?name=broken.mp4',raw=b'bad')[0],400)
        self.assertEqual(len(list((self.roots['INPUT_ROOT']/'kendo-v4-upload').iterdir())),1)
        self.assertEqual(self.request('/api/kendo/upscale/select',dict(filename='../clip.mp4'))[0],400)
        self.assertEqual(self.request('/api/kendo/upscale/upload?name=bad.exe',raw=b'bad')[0],400)
        self.assertEqual(self.request('/api/kendo/upscale/select',raw=b'[]')[0],400)
        with patch.object(models,'readiness',return_value=dict(models_ready=False)):
            self.assertEqual(self.request('/api/kendo/upscale',dict(source_id=source['source_id']))[0],503)

if __name__ == '__main__': unittest.main()
