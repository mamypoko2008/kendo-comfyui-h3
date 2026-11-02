"""Parallel, resumable V4 beta.2 model downloads with exact-size verification."""
import concurrent.futures
import fcntl
import os
from pathlib import Path
import subprocess
import time
from models_v4_beta2 import MODEL_ROOT, MODEL_SPECS, READY_FILE, ERROR_FILE, model_url

def download(spec):
    relative, expected = spec
    target = Path(MODEL_ROOT, relative)
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.is_file() and target.stat().st_size == expected:
        print('[KENDO V4 beta.2] Reusing ' + relative, flush=True)
        return
    if target.exists():
        target.rename(str(target) + '.incomplete.' + str(time.time_ns()))
    partial = Path(str(target) + '.part')
    connections = str(max(1, min(16, int(os.environ.get('KENDO_CONNECTIONS_PER_FILE', '4')))))
    subprocess.run([
        'aria2c', '--continue=true', '--allow-overwrite=true', '--auto-file-renaming=false',
        '--file-allocation=none', '--max-tries=20', '--retry-wait=5', '--connect-timeout=30',
        '--timeout=60', '--min-split-size=16M', '--summary-interval=5',
        '--max-connection-per-server=' + connections, '--split=' + connections,
        '--dir=' + str(target.parent), '--out=' + partial.name, model_url(spec)
    ], check=True)
    if partial.stat().st_size != expected:
        raise RuntimeError('Incorrect size: ' + relative)
    partial.replace(target)
    print('[KENDO V4 beta.2] Ready ' + relative, flush=True)

def main():
    with open('/workspace/.kendo-model-download.lock', 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        Path(READY_FILE).unlink(missing_ok=True)
        Path(ERROR_FILE).unlink(missing_ok=True)
        try:
            with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
                futures = [pool.submit(download, spec) for spec in MODEL_SPECS]
                for future in concurrent.futures.as_completed(futures):
                    future.result()
            Path(READY_FILE).write_text('V4 beta.2 ready\n')
        except Exception as error:
            Path(ERROR_FILE).write_text(str(error))
            raise

if __name__ == '__main__':
    main()
