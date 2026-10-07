"""V4 generation page plus persistent, server-side LTX upscale jobs."""
import http.client
import json
import os
import re
import shutil
import sys
import threading
import uuid
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from http.server import ThreadingHTTPServer

try:
    import media_v4
except ModuleNotFoundError:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'custom_nodes' / 'kendo_v4'))
    import media_v4
import models_v4 as h3
import ltx_models_v4 as ltx
import page_server_v3_beta as v3
from upscale_workflow_v4 import build_workflow, DEFAULT_PROMPT

VERSION = '4.0.0-beta.2'
INPUT_ROOT = Path(os.environ.get('KENDO_INPUT_DIR', '/workspace/runpod-slim/ComfyUI/input'))
OUTPUT_ROOT = Path(os.environ.get('KENDO_OUTPUT_DIR', '/workspace/runpod-slim/ComfyUI/output'))
STATE_ROOT = Path(os.environ.get('KENDO_V4_STATE_DIR', '/workspace/.kendo-v4'))
MAX_UPLOAD = int(os.environ.get('KENDO_UPSCALE_MAX_UPLOAD_BYTES', str(512 * 1024 * 1024)))
STATE_LOCK = threading.RLock()

def comfy(route, payload=None):
    connection = http.client.HTTPConnection(v3.base.COMFY_HOST, v3.base.COMFY_PORT, timeout=30)
    try:
        body = None if payload is None else json.dumps(payload).encode()
        connection.request('GET' if payload is None else 'POST', route, body=body,
                           headers={'Content-Type': 'application/json', 'Connection': 'close'})
        response = connection.getresponse()
        result = json.loads(response.read())
        if response.status >= 400:
            detail = result.get('error', {})
            raise ValueError(detail.get('message', str(detail)) if isinstance(detail, dict) else str(detail))
        return result
    finally:
        connection.close()

def write_record(kind, key, value):
    if not re.fullmatch(r'[a-zA-Z0-9_-]{1,100}', key):
        raise ValueError('รหัสงานไม่ถูกต้อง')
    with STATE_LOCK:
        directory = STATE_ROOT / kind
        directory.mkdir(parents=True, exist_ok=True)
        temporary = directory / (key + '.' + uuid.uuid4().hex + '.tmp')
        temporary.write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')
        temporary.replace(directory / (key + '.json'))

def read_record(kind, key):
    if not isinstance(key, str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,100}', key):
        raise ValueError('รหัสงานไม่ถูกต้อง')
    try:
        return json.loads((STATE_ROOT / kind / (key + '.json')).read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError('ไม่พบคลิปหรืองานที่เลือก') from error

def file_descriptor(path, root):
    relative = path.resolve().relative_to(root.resolve())
    return dict(filename=relative.name, subfolder='' if relative.parent == Path('.') else relative.parent.as_posix(),
                type='output' if root == OUTPUT_ROOT else 'input')

def stage_output(file):
    if file.get('type', 'output') != 'output':
        raise ValueError('กรุณาเลือกคลิปจากไฟล์งาน หรืออัปโหลดวิดีโอ')
    path = media_v4.contained_file(OUTPUT_ROOT, file.get('filename'), file.get('subfolder', ''))
    metadata = media_v4.probe(path)
    key = uuid.uuid4().hex
    directory = INPUT_ROOT / 'kendo-v4-upscale'
    directory.mkdir(parents=True, exist_ok=True)
    staged = directory / (key + path.suffix.lower())
    shutil.copyfile(path, staged)
    record = dict(source_id=key, name=path.name, source_kind='generated', original=file_descriptor(path, OUTPUT_ROOT),
                  video='kendo-v4-upscale/' + staged.name, metadata=metadata)
    write_record('sources', key, record)
    return record

def source_file(source):
    path = Path(source['video'])
    return media_v4.contained_file(INPUT_ROOT, path.name, path.parent.as_posix())

def videos(value):
    if not isinstance(value, (dict, list)):
        return []
    if isinstance(value, dict) and isinstance(value.get('filename'), str) and Path(value['filename']).suffix.lower() in media_v4.VIDEO_EXTENSIONS:
        return [value]
    children = value.values() if isinstance(value, dict) else value
    return [file for item in children for file in videos(item)]

def job_status(key):
    job = read_record('jobs', key)
    if job.get('status') == 'done':
        file = job['file']
        try:
            media_v4.contained_file(OUTPUT_ROOT, file['filename'], file.get('subfolder', ''))
            return job
        except ValueError:
            job['status'] = 'missing_output'
            return job
    queue = comfy('/queue')
    if any(item[1] == key for item in queue.get('queue_running', [])):
        job['status'] = 'running'
    elif any(item[1] == key for item in queue.get('queue_pending', [])):
        job['status'] = 'queued'
    else:
        entry = comfy('/history/' + key).get(key)
        if not entry:
            job['status'] = 'unknown'
        elif entry.get('status', {}).get('status_str') == 'error':
            job['status'] = 'error'
            messages = entry.get('status', {}).get('messages', [])
            job['error'] = '\n'.join(str(detail.get('exception_message', 'ประมวลผลไม่สำเร็จ'))
                                     for kind, detail in messages if kind == 'execution_error') or 'ประมวลผลไม่สำเร็จ ตรวจ Comfy Console'
        else:
            outputs = videos(entry.get('outputs', {}))
            if outputs:
                media_v4.contained_file(OUTPUT_ROOT, outputs[0]['filename'], outputs[0].get('subfolder', ''))
                job.update(status='done', file=outputs[0])
            else:
                job.update(status='error', error='งานจบโดยไม่มีวิดีโอผลลัพธ์')
    write_record('jobs', key, job)
    return job

class V4Handler(v3.V3Handler):
    def _json(self, payload, status=200, include_body=True):
        data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        if include_body:
            self.wfile.write(data)

    def _body(self):
        size = int(self.headers.get('Content-Length', '0'))
        if not 0 < size <= 16384:
            raise ValueError('ข้อมูลคำขอไม่ถูกต้อง')
        value = json.loads(self.rfile.read(size))
        if not isinstance(value, dict):
            raise ValueError('ข้อมูลคำขอไม่ถูกต้อง')
        return value

    def _send_kendo_status(self, include_body=True):
        total = sum(size for _, size in h3.MODEL_SPECS)
        downloaded = 0
        for relative, size in h3.MODEL_SPECS:
            path = Path(h3.MODEL_ROOT, relative)
            if not path.exists():
                path = Path(str(path) + '.part')
            try:
                downloaded += min(size, path.stat().st_size)
            except OSError:
                pass
        try:
            error = Path(h3.ERROR_FILE).read_text(encoding='utf-8')
        except OSError:
            error = None
        self._json(dict(version=VERSION, models_ready=h3.files_ready(), comfy_ready=self._comfy_ready(),
            progress=round(downloaded * 100 / total, 1), downloaded_bytes=downloaded, total_bytes=total,
            download_error=error, mcp_ready=self._mcp_ready(), mcp_url=v3.mcp_url(), comfy_url=v3.comfy_url(),
            upscale=ltx.readiness()), include_body=include_body)

    def do_GET(self):
        route = urlsplit(self.path).path
        try:
            if route == '/api/kendo/files':
                items = []
                if OUTPUT_ROOT.exists():
                    for path in OUTPUT_ROOT.rglob('*'):
                        if path.is_file() and path.suffix.lower() in media_v4.VIDEO_EXTENSIONS:
                            try:
                                file = file_descriptor(path, OUTPUT_ROOT)
                                file.update(size_bytes=path.stat().st_size, modified=path.stat().st_mtime)
                                items.append(file)
                            except (ValueError, OSError):
                                pass
                return self._json(dict(files=sorted(items, key=lambda f: f['modified'], reverse=True)[:200]))
            if route == '/api/kendo/upscale/status':
                ready = ltx.readiness()
                try:
                    info = comfy('/object_info')
                    required = {node['class_type'] for node in build_workflow('source.mp4',
                        media_v4.geometry(dict(display_width=1920, display_height=1080), '1080p')).values()}
                    ready['missing_nodes'] = sorted(required - info.keys())
                    ready['nodes_ready'] = not ready['missing_nodes']
                except (OSError, ValueError, http.client.HTTPException):
                    ready['nodes_ready'] = False
                ready.update(version=VERSION, max_upload_bytes=MAX_UPLOAD,
                             max_seconds=float(os.environ.get('KENDO_UPSCALE_MAX_SECONDS', '60')))
                return self._json(ready)
            if route.startswith('/api/kendo/upscale/source/'):
                source = read_record('sources', route.rsplit('/', 1)[1])
                source_file(source)
                return self._json(source)
            if route.startswith('/api/kendo/upscale/job/'):
                return self._json(job_status(route.rsplit('/', 1)[1]))
            if route == '/api/kendo/upscale/jobs':
                folder = STATE_ROOT / 'jobs'
                paths = sorted(folder.glob('*.json'), key=lambda p: p.stat().st_mtime, reverse=True)[:50] if folder.exists() else []
                jobs = []
                for path in paths:
                    try:
                        jobs.append(read_record('jobs', path.stem))
                    except ValueError:
                        pass
                return self._json(dict(jobs=jobs))
        except (ValueError, json.JSONDecodeError) as error:
            return self._json(dict(error=str(error)), 400)
        except (OSError, http.client.HTTPException) as error:
            return self._json(dict(error='ระบบยังไม่พร้อม กรุณาลองใหม่', detail=str(error)), 503)
        super().do_GET()

    def do_POST(self):
        route = urlsplit(self.path).path
        if not route.startswith('/api/kendo/upscale'):
            return super().do_POST()
        try:
            if route == '/api/kendo/upscale/select':
                return self._json(stage_output(self._body()))
            if route == '/api/kendo/upscale/upload':
                return self._upload_video()
            if route == '/api/kendo/upscale':
                request = self._body()
                if not ltx.readiness()['models_ready']:
                    return self._json(dict(error='โมเดล LTX ยังไม่พร้อม ตรวจสถานะดาวน์โหลดอัพสเกล'), 503)
                source = read_record('sources', request.get('source_id'))
                metadata = media_v4.probe(source_file(source))
                sizes = media_v4.geometry(metadata, request.get('preset', '4K'))
                # Fail before queueing when the full guide alone would exhaust RAM.
                try:
                    import psutil
                    required = media_v4.padded_frames(metadata['frame_count']) * sizes['canvas_width'] * sizes['canvas_height'] * 12
                    if required > psutil.virtual_memory().available * 0.6:
                        raise ValueError('RAM ไม่พอสำหรับคลิปขนาดนี้ กรุณาทดสอบ 1080p หรือแบ่งช็อตให้สั้นลง')
                except ImportError:
                    pass
                seed = request.get('seed', 42)
                graph = build_workflow(source['video'], sizes, request.get('prompt', DEFAULT_PROMPT), seed)
                response = comfy('/prompt', dict(prompt=graph, client_id='kendo-v4-' + uuid.uuid4().hex))
                key = response.get('prompt_id')
                if not key:
                    raise ValueError('ComfyUI ไม่คืนรหัสงาน')
                job = dict(job_id=key, source_id=source['source_id'], name=source['name'], source_kind=source['source_kind'],
                           preset=request.get('preset', '4K'), seed=seed, metadata=metadata, **sizes, status='queued')
                write_record('jobs', key, job)
                return self._json(job, 202)
            return self._json(dict(error='ไม่พบ API'), 404)
        except (ValueError, json.JSONDecodeError) as error:
            # Close malformed POST bodies rather than reuse unread bytes as a request.
            self.close_connection = True
            return self._json(dict(error=str(error)), 400)
        except (OSError, http.client.HTTPException, TimeoutError) as error:
            self.close_connection = True
            return self._json(dict(error='ประมวลผลคำขอไม่สำเร็จ กรุณาลองใหม่', detail=str(error)), 503)

    def _upload_video(self):
        name = parse_qs(urlsplit(self.path).query).get('name', [''])[0]
        extension = Path(name).suffix.lower()
        size = int(self.headers.get('Content-Length', '0'))
        if extension not in {'.mp4', '.mov', '.webm'} or not 0 < size <= MAX_UPLOAD:
            raise ValueError('เลือก MP4, MOV หรือ WebM ขนาดไม่เกิน 512 MB')
        key = uuid.uuid4().hex
        folder = INPUT_ROOT / 'kendo-v4-upload'
        folder.mkdir(parents=True, exist_ok=True)
        partial = folder / (key + '.part')
        target = folder / (key + extension)
        self.connection.settimeout(180)
        try:
            with partial.open('wb') as stream:
                remaining = size
                while remaining:
                    chunk = self.rfile.read(min(remaining, 1024 * 1024))
                    if not chunk:
                        raise ValueError('อัปโหลดไม่ครบ กรุณาลองใหม่')
                    stream.write(chunk)
                    remaining -= len(chunk)
            partial.replace(target)
            metadata = media_v4.probe(target)
            source = dict(source_id=key, name=Path(name).name, source_kind='upload', video='kendo-v4-upload/' + target.name,
                          metadata=metadata, original=file_descriptor(target, INPUT_ROOT))
            write_record('sources', key, source)
            return self._json(source, 201)
        except Exception:
            partial.unlink(missing_ok=True)
            target.unlink(missing_ok=True)
            raise

if __name__ == '__main__':
    ThreadingHTTPServer((v3.base.LISTEN_HOST, v3.base.LISTEN_PORT), V4Handler).serve_forever()
