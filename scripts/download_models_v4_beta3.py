"""Parallel and resumable downloader for the V4 beta.3 video/image bundle."""
import concurrent.futures
import fcntl
import os
from pathlib import Path
import shutil
import subprocess
import time
from models_v4_beta3 import MODEL_ROOT, MODEL_SPECS, READY_FILE, ERROR_FILE, model_url

RESERVE_BYTES = 12 * 1024 ** 3

def remaining_bytes():
    remaining = 0
    for relative, expected in MODEL_SPECS:
        target = Path(MODEL_ROOT, relative)
        if target.is_file() and target.stat().st_size == expected:
            continue
        partial = Path(str(target) + '.part')
        reusable = partial.stat().st_size if partial.is_file() and partial.stat().st_size <= expected else 0
        remaining += expected - reusable
    return remaining

def download(relative, expected):
    target = Path(MODEL_ROOT, relative)
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.is_file() and target.stat().st_size == expected:
        print('[KENDO V4 beta.3] Reusing ' + relative, flush=True)
        return
    if target.exists():
        target.rename(str(target) + '.incomplete.' + str(time.time_ns()))
    partial = Path(str(target) + '.part')
    connections = str(max(1, min(16, int(os.environ.get('KENDO_CONNECTIONS_PER_FILE', '4')))))
    subprocess.run(['aria2c','--continue=true','--allow-overwrite=true','--auto-file-renaming=false',
        '--file-allocation=none','--max-tries=20','--retry-wait=5','--connect-timeout=30','--timeout=60',
        '--min-split-size=16M','--summary-interval=5','--max-connection-per-server=' + connections,
        '--split=' + connections,'--dir=' + str(target.parent),'--out=' + partial.name,model_url(relative)], check=True)
    if partial.stat().st_size != expected:
        raise RuntimeError('Incorrect size: ' + relative)
    partial.replace(target)
    print('[KENDO V4 beta.3] Ready ' + relative, flush=True)

def main():
    Path(MODEL_ROOT).mkdir(parents=True, exist_ok=True)
    with open('/workspace/.kendo-model-download.lock', 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        Path(READY_FILE).unlink(missing_ok=True)
        Path(ERROR_FILE).unlink(missing_ok=True)
        try:
            required = remaining_bytes() + RESERVE_BYTES
            free = shutil.disk_usage(MODEL_ROOT).free
            if free < required:
                raise RuntimeError(f'Not enough volume space: need {required / 1024**3:.1f} GiB free; have {free / 1024**3:.1f} GiB')
            with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
                futures = [pool.submit(download, *spec) for spec in MODEL_SPECS]
                for future in concurrent.futures.as_completed(futures):
                    future.result()
            Path(READY_FILE).write_text('v4 beta.3 ready\n', encoding='utf-8')
        except Exception as error:
            Path(ERROR_FILE).write_text(str(error), encoding='utf-8')
            raise

if __name__ == '__main__':
    main()
