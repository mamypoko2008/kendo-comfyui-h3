"""Video IO around the official LTX graph: pad frames/canvas, then trim/remux."""
import os
import subprocess
import tempfile
import uuid
from pathlib import Path

import folder_paths
import numpy as np
import torch
import comfy.model_management
from .media_v4 import contained_file, padded_frames, probe

def input_file(video):
    relative = Path(video)
    return contained_file(folder_paths.get_input_directory(), relative.name, relative.parent.as_posix() if relative.parent != Path('.') else '')

class KendoLTXLoadVideo:
    CATEGORY = 'Kendo/V4'
    RETURN_TYPES = ('IMAGE', 'INT', 'FLOAT', 'INT')
    RETURN_NAMES = ('images', 'padded_frames', 'fps', 'original_frames')
    FUNCTION = 'load'

    @classmethod
    def INPUT_TYPES(cls):
        return {'required': {'video': ('STRING',), **{key: ('INT', {'min': 2, 'max': 8192}) for key in
                ('target_width', 'target_height', 'canvas_width', 'canvas_height')}}}

    @classmethod
    def IS_CHANGED(cls, video, **kwargs):
        path = input_file(video)
        return (path.stat().st_mtime_ns, path.stat().st_size)

    def load(self, video, target_width, target_height, canvas_width, canvas_height):
        path = input_file(video)
        info = probe(path)
        count = info['frame_count']
        if count < 1:
            raise ValueError('ไม่สามารถนับเฟรมต้นฉบับ')
        length = padded_frames(count)
        buffer = np.empty((length, canvas_height, canvas_width, 3), dtype=np.float32)
        frame_bytes = canvas_width * canvas_height * 3
        vf = f'scale={target_width}:{target_height}:flags=lanczos,setsar=1,pad={canvas_width}:{canvas_height}:0:0'
        args = ['ffmpeg', '-v', 'error', '-i', str(path), '-map', '0:v:0', '-vf', vf, '-fps_mode', 'passthrough',
                '-an', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']
        with tempfile.TemporaryFile() as errors:
            process = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=errors)
            try:
                for index in range(count):
                    comfy.model_management.throw_exception_if_processing_interrupted()
                    raw = process.stdout.read(frame_bytes)
                    if len(raw) != frame_bytes:
                        raise ValueError('จำนวนเฟรมที่อ่านไม่ตรงต้นฉบับ')
                    pixels = np.frombuffer(raw, dtype=np.uint8).reshape(canvas_height, canvas_width, 3)
                    np.divide(pixels, 255.0, out=buffer[index], casting='unsafe')
                if process.stdout.read(1):
                    raise ValueError('จำนวนเฟรมต้นฉบับเปลี่ยนไป กรุณาเลือกคลิปใหม่')
                if process.wait(timeout=60):
                    raise ValueError('ถอดรหัสวิดีโอไม่สำเร็จ')
            finally:
                if process.poll() is None:
                    process.kill(); process.wait()
                process.stdout.close()
        buffer[count:] = buffer[count - 1]
        return (torch.from_numpy(buffer), length, info['fps'], count)

class KendoLTXSaveVideo:
    CATEGORY = 'Kendo/V4'
    RETURN_TYPES = ()
    OUTPUT_NODE = True
    FUNCTION = 'save'

    @classmethod
    def INPUT_TYPES(cls):
        return {'required': {'images': ('IMAGE',), 'video': ('STRING',), 'fps': ('FLOAT',),
                'original_frames': ('INT',), 'target_width': ('INT',), 'target_height': ('INT',),
                'filename_prefix': ('STRING', {'default': 'video/Kendo_LTX_v4'})}}

    def save(self, images, video, fps, original_frames, target_width, target_height, filename_prefix):
        source = input_file(video)
        if len(images) < original_frames or fps <= 0:
            raise ValueError('เฟรมผลลัพธ์ไม่ครบตามต้นฉบับ')
        # User-supplied prefixes never select arbitrary filesystem locations.
        output_root = Path(folder_paths.get_output_directory()).resolve()
        prefix = Path(filename_prefix)
        directory = (output_root / prefix.parent).resolve()
        if not directory.is_relative_to(output_root) or not prefix.name or '\\' in filename_prefix:
            raise ValueError('โฟลเดอร์ผลลัพธ์ไม่ถูกต้อง')
        directory.mkdir(parents=True, exist_ok=True)
        name = prefix.name + '_' + uuid.uuid4().hex[:12] + '.mp4'
        destination = directory / name
        with tempfile.TemporaryDirectory(dir=directory, prefix='.kendo-ltx-') as temporary:
            temp = Path(temporary)
            silent = temp / 'video.mp4'
            with tempfile.TemporaryFile() as errors:
                process = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
                    '-s', f'{target_width}x{target_height}', '-framerate', str(fps), '-i', 'pipe:0', '-an',
                    '-frames:v', str(original_frames), '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
                    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(silent)], stdin=subprocess.PIPE, stderr=errors)
                try:
                    for index in range(original_frames):
                        comfy.model_management.throw_exception_if_processing_interrupted()
                        frame = images[index, :target_height, :target_width, :3].detach().cpu().numpy()
                        process.stdin.write(np.clip(frame * 255, 0, 255).astype(np.uint8).tobytes())
                    process.stdin.close()
                    if process.wait(timeout=300):
                        raise ValueError('บันทึกวิดีโออัพสเกลไม่สำเร็จ')
                finally:
                    if process.poll() is None:
                        process.kill(); process.wait()
                    if not process.stdin.closed:
                        process.stdin.close()
            muxed = temp / 'muxed.mp4'
            common = ['ffmpeg', '-v', 'error', '-y', '-i', str(silent), '-i', str(source), '-map', '0:v:0',
                      '-map', '1:a:0?', '-c:v', 'copy', '-t', str(original_frames / fps), '-movflags', '+faststart']
            # Preserve the source audio bitstream if MP4 supports its codec;
            # otherwise encode that same soundtrack, never generate new audio.
            for codec in ('copy', 'aac'):
                result = subprocess.run(common + ['-c:a', codec, str(muxed)], capture_output=True, timeout=300)
                if result.returncode == 0:
                    break
            else:
                raise ValueError('รวมเสียงกับวิดีโออัพสเกลไม่สำเร็จ')
            muxed.replace(destination)
        relative = directory.relative_to(output_root).as_posix()
        return {'ui': {'videos': [{'filename': name, 'subfolder': '' if relative == '.' else relative, 'type': 'output'}]}}

NODE_CLASS_MAPPINGS = {'KendoLTXLoadVideo': KendoLTXLoadVideo, 'KendoLTXSaveVideo': KendoLTXSaveVideo}
NODE_DISPLAY_NAME_MAPPINGS = {'KendoLTXLoadVideo': 'Kendo V4 · LTX Source', 'KendoLTXSaveVideo': 'Kendo V4 · Save Refined Video'}
