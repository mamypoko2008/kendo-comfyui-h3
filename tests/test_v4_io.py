"""Exercise padding, delivery crop/trim and audio fallback without a GPU."""
import importlib
import io
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'custom_nodes'))
sys.path.insert(0,str(ROOT/'scripts'))
import download_models_v4 as downloader

class Tensor:
    def __init__(self,array): self.array=array
    def __len__(self): return len(self.array)
    def __getitem__(self,key): return Tensor(self.array[key])
    def detach(self): return self
    def cpu(self): return self
    def numpy(self): return self.array

class Process:
    def __init__(self,raw=b'',sink=None):
        self.stdout=io.BytesIO(raw); self.stdin=io.BytesIO(); self.finished=False; self.sink=sink
    def wait(self,timeout=None): self.finished=True; return 0
    def poll(self): return 0 if self.finished else None
    def kill(self): self.finished=True

class VideoIOTests(unittest.TestCase):
    def test_frames_are_padded_then_cropped_and_trimmed_with_source_audio(self):
        with tempfile.TemporaryDirectory() as folder:
            input_dir=Path(folder)/'input'; output_dir=Path(folder)/'output';input_dir.mkdir();output_dir.mkdir()
            (input_dir/'source.mp4').write_bytes(b'clip')
            management=types.ModuleType('comfy.model_management'); management.throw_exception_if_processing_interrupted=lambda:None
            comfy=types.ModuleType('comfy');comfy.model_management=management
            modules={'folder_paths':types.SimpleNamespace(get_input_directory=lambda:str(input_dir),get_output_directory=lambda:str(output_dir)),
                     'torch':types.SimpleNamespace(from_numpy=lambda a:Tensor(a)), 'comfy':comfy,'comfy.model_management':management}
            with patch.dict(sys.modules,modules):
                nodes=importlib.import_module('kendo_v4')
                raw=np.arange(2*4*4*3,dtype=np.uint8).tobytes()
                with patch.object(nodes,'probe',return_value=dict(frame_count=2,fps=24)), \
                     patch.object(nodes.subprocess,'Popen',return_value=Process(raw)):
                    tensor,padded,fps,count=nodes.KendoLTXLoadVideo().load('source.mp4',2,2,4,4)
                self.assertEqual((padded,fps,count),(9,24,2))
                np.testing.assert_array_equal(tensor.array[2:],np.repeat(tensor.array[1:2],7,axis=0))
                sent=[];mux=[]
                class Encoder(Process):
                    def __init__(self,args,**kw):
                        super().__init__(); Path(args[-1]).write_bytes(b'silent')
                        class Sink(io.BytesIO):
                            def close(inner): sent.append(inner.getvalue());super().close()
                        self.stdin=Sink()
                def remux(args,**kw):
                    mux.append(args)
                    failed=args[args.index('-c:a')+1]=='copy'
                    if not failed:Path(args[-1]).write_bytes(b'final with soundtrack')
                    return types.SimpleNamespace(returncode=1 if failed else 0)
                with patch.object(nodes.subprocess,'Popen',side_effect=Encoder),patch.object(nodes.subprocess,'run',side_effect=remux):
                    result=nodes.KendoLTXSaveVideo().save(tensor,'source.mp4',24,2,2,2,'video/Test')
                self.assertEqual(len(sent[0]),2*2*2*3)
                expected=np.clip(tensor.array[:2,:2,:2]*255,0,255).astype(np.uint8).tobytes()
                self.assertEqual(sent[0],expected)
                self.assertEqual([args[args.index('-c:a')+1] for args in mux],['copy','aac'])
                self.assertIn('1:a:0?',mux[1]);self.assertNotIn('-shortest',mux[1])
                file=result['ui']['videos'][0]
                self.assertEqual((output_dir/file['subfolder']/file['filename']).read_bytes(),b'final with soundtrack')
                self.assertRaises(ValueError,nodes.KendoLTXSaveVideo().save,tensor,'source.mp4',24,2,2,2,'../escape')

class DownloadTests(unittest.TestCase):
    def test_resume_and_ignore_stale_ready_flags(self):
        with tempfile.TemporaryDirectory() as folder,patch.object(downloader.h3,'MODEL_ROOT',folder):
            partial=Path(folder)/'model.part';partial.write_bytes(b'abc')
            response=io.BytesIO(b'def');response.status=206;response.headers={'Content-Range':'bytes 3-5/6'}
            with patch.object(downloader.urllib.request,'urlopen',return_value=response) as open_url:
                downloader.download('repo','model',6)
                self.assertEqual(open_url.call_args.args[0].get_header('Range'),'bytes=3-')
            self.assertEqual((Path(folder)/'model').read_bytes(),b'abcdef')
            with patch.object(downloader.urllib.request,'urlopen',side_effect=AssertionError('no network')):
                downloader.download('repo','model',6)
    def test_failed_download_is_not_promoted(self):
        with tempfile.TemporaryDirectory() as folder,patch.object(downloader.h3,'MODEL_ROOT',folder):
            def response(*args,**kw):
                stream=io.BytesIO(b'incomplete');stream.status=200;stream.headers={};return stream
            with patch.object(downloader.urllib.request,'urlopen',side_effect=response),patch.object(downloader.time,'sleep'):
                self.assertRaises(RuntimeError,downloader.download,'repo','model',100)
            self.assertFalse((Path(folder)/'model').exists())

if __name__=='__main__': unittest.main()
