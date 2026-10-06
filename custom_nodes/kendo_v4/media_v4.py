"""Pure-stdlib media geometry shared by the V4 service and Comfy nodes."""
import json
import math
import os
import subprocess
from fractions import Fraction
from pathlib import Path

VIDEO_EXTENSIONS = {'.mp4', '.mov', '.webm', '.mkv'}

def contained_file(root, filename, subfolder=''):
    root = Path(root).resolve()
    if not isinstance(filename, str) or not filename or Path(filename).name != filename or '\\' in filename or ':' in filename:
        raise ValueError('ชื่อไฟล์ไม่ถูกต้อง')
    if not isinstance(subfolder, str) or '\\' in subfolder or ':' in subfolder:
        raise ValueError('โฟลเดอร์ไม่ถูกต้อง')
    target = (root / subfolder / filename).resolve()
    if not target.is_relative_to(root) or not target.is_file() or target.suffix.lower() not in VIDEO_EXTENSIONS:
        raise ValueError('ไม่พบวิดีโอในโฟลเดอร์งาน')
    return target

def geometry(metadata, preset):
    if preset not in ('1080p', '4K'):
        raise ValueError('เลือกความละเอียด 1080p หรือ 4K')
    long_edge = 1920 if preset == '1080p' else 3840
    width, height = metadata['display_width'], metadata['display_height']
    scale = long_edge / max(width, height)
    # Only even delivery dimensions are needed by H.264; pad, rather than
    # stretch, to the multiples of 32 that the diffusion model requires.
    target_width = max(2, 2 * round(width * scale / 2))
    target_height = max(2, 2 * round(height * scale / 2))
    return dict(target_width=target_width, target_height=target_height,
                canvas_width=math.ceil(target_width / 32) * 32,
                canvas_height=math.ceil(target_height / 32) * 32)

def padded_frames(count):
    if not isinstance(count, int) or count < 1:
        raise ValueError('วิดีโอไม่มีเฟรม')
    return max(9, math.ceil((count - 1) / 8) * 8 + 1)

def probe(path, count_frames=True):
    args = [os.environ.get('KENDO_FFPROBE', 'ffprobe'), '-v', 'error']
    if count_frames:
        args.append('-count_frames')
    args += ['-show_streams', '-show_format', '-of', 'json', str(path)]
    try:
        result = subprocess.run(args, capture_output=True, check=True, timeout=180)
        info = json.loads(result.stdout)
        video = next(s for s in info['streams'] if s.get('codec_type') == 'video')
        rate = video.get('avg_frame_rate')
        if not rate or rate in ('0/0', '0', 'N/A'):
            rate = video.get('r_frame_rate', '0')
        fps = Fraction(rate)
        sar_value = video.get('sample_aspect_ratio')
        sar = Fraction((sar_value if sar_value and sar_value != 'N/A' else '1:1').replace(':', '/'))
        if sar <= 0:
            sar = Fraction(1)
        width, height = int(video['width']), int(video['height'])
        display_width, display_height = float(width * sar), float(height)
        rotation = round(float(video.get('tags', {}).get('rotate', 0)))
        for side in video.get('side_data_list', []):
            if 'rotation' in side:
                rotation = round(float(side['rotation']))
        if rotation % 180:
            display_width, display_height = display_height, display_width
        frames = int(next((video.get(key) for key in ('nb_read_frames', 'nb_frames')
                           if video.get(key) not in (None, '', 'N/A')), 0))
        duration = float(video.get('duration') or info.get('format', {}).get('duration') or 0)
        if frames:
            duration = frames / float(fps)
        if not (0 < float(fps) <= 120 and width > 0 and height > 0 and duration > 0 and frames > 0):
            raise ValueError('วิดีโอมีข้อมูลเวลา/ขนาดไม่ถูกต้อง')
        if duration > float(os.environ.get('KENDO_UPSCALE_MAX_SECONDS', '60')):
            raise ValueError('คลิปยาวเกินขีดจำกัดอัพสเกลของระบบ กรุณาแบ่งเป็นช็อต')
        if max(width, height) > 8192 or width * height > 34000000:
            raise ValueError('ต้นฉบับมีขนาดใหญ่เกินขีดจำกัดของระบบ')
        orientation = 'landscape' if display_width > display_height else 'portrait' if display_width < display_height else 'square'
        return dict(width=width, height=height, display_width=display_width, display_height=display_height,
                    rotation=rotation, sample_aspect_ratio=str(sar), fps=float(fps), fps_fraction=str(fps),
                    frame_count=frames, duration=duration, orientation=orientation,
                    has_audio=any(s.get('codec_type') == 'audio' for s in info['streams']))
    except (StopIteration, KeyError, TypeError, ZeroDivisionError, json.JSONDecodeError,
            subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
        raise ValueError('อ่านวิดีโอไม่ได้ กรุณาเลือกไฟล์ที่เปิดเล่นได้') from error
