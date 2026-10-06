"""Independent H3/LTX downloads; a gated LTX failure never blocks generation."""
import concurrent.futures
import os
from pathlib import Path
import time
import urllib.error
import urllib.request
import models_v4 as h3
import ltx_models_v4 as ltx

def download(repo, relative, size):
    target = Path(h3.MODEL_ROOT, relative)
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.is_file() and target.stat().st_size == size:
        return
    partial = Path(str(target) + '.part')
    url = 'https://huggingface.co/' + repo + '/resolve/main/' + ltx.remote_name(repo, relative)
    token = os.environ.get('HF_TOKEN', '').strip()
    for attempt in range(6):
        offset = partial.stat().st_size if partial.exists() else 0
        if offset > size:
            partial.unlink(); offset = 0
        if offset == size:
            partial.replace(target); return
        headers = {'User-Agent': 'Kendo-V4/4.0.0-beta.1'}
        if token:
            headers['Authorization'] = 'Bearer ' + token
        if offset:
            headers['Range'] = 'bytes=' + str(offset) + '-'
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=90) as response:
                if response.status == 206:
                    if not response.headers.get('Content-Range', '').startswith('bytes ' + str(offset) + '-'):
                        raise RuntimeError('Download resume range mismatch')
                else:
                    offset = 0
                with partial.open('ab' if offset else 'wb') as stream:
                    while chunk := response.read(1024 * 1024):
                        stream.write(chunk)
                if partial.stat().st_size != size:
                    raise RuntimeError('Incomplete download: ' + relative)
                partial.replace(target)
                print('[V4] Ready ' + relative, flush=True)
                return
        except urllib.error.HTTPError as error:
            if error.code in (401, 403):
                raise RuntimeError('Hugging Face ต้องยอมรับสิทธิ์โมเดลและตั้ง HF_TOKEN ใน Pod แล้ว restart: ' + repo) from None
            if attempt == 5:
                raise RuntimeError('HTTP download failed: ' + str(error.code)) from None
        except (OSError, RuntimeError):
            if attempt == 5:
                raise
        time.sleep(5)

def group(specs, ready_file, error_file):
    Path(error_file).unlink(missing_ok=True)
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            tasks = [pool.submit(download, *spec) for spec in specs]
            for task in concurrent.futures.as_completed(tasks):
                task.result()
        Path(ready_file).write_text('V4 ready\n', encoding='utf-8')
    except Exception as error:
        Path(error_file).write_text(str(error), encoding='utf-8')
        print('[V4] Download group requires attention: ' + str(error), flush=True)

def main():
    import fcntl
    Path(h3.MODEL_ROOT).mkdir(parents=True, exist_ok=True)
    with open('/workspace/.kendo-model-download.lock', 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            h3_task = pool.submit(group, [('Comfy-Org/MiniMax-H3', name, size) for name, size in h3.MODEL_SPECS], h3.READY_FILE, h3.ERROR_FILE)
            ltx_task = pool.submit(group, ltx.MODEL_SPECS, ltx.READY_FILE, ltx.ERROR_FILE)
            h3_task.result(); ltx_task.result()

if __name__ == '__main__':
    main()
