"""Keep the V3 H3 downloader and install only standard Qwen Image 2.1."""
from pathlib import Path
import shutil
import subprocess
import sys
import models_v3_beta as models
import download_image_models as qwen

RESERVE = 5 * 1024 ** 3
ERROR_FILE = Path('/workspace/.kendo-qwen-v4-error')


def remaining_bytes(root, specs):
    remaining = 0
    for relative, expected in specs:
        target = Path(root, relative)
        if target.is_file() and target.stat().st_size == expected:
            continue
        partial = target.with_name(target.name + '.part')
        reusable = partial.stat().st_size if partial.is_file() and partial.stat().st_size <= expected else 0
        remaining += expected - reusable
    return remaining


def ensure_space(root, specs):
    Path(root).mkdir(parents=True, exist_ok=True)
    required = remaining_bytes(root, specs) + RESERVE
    free = shutil.disk_usage(root).free
    if free < required:
        raise RuntimeError(f'Not enough model-volume space: need {required / 1024**3:.1f} GiB free; have {free / 1024**3:.1f} GiB')


def main():
    import download_models_v3_beta as h3  # Linux downloader uses fcntl.
    root = models.MODEL_ROOT
    specs = tuple(models.MODEL_SPECS) + qwen.selected_specs('qwen21')
    ERROR_FILE.unlink(missing_ok=True)
    try:
        ensure_space(root, specs)
    except Exception as error:
        ERROR_FILE.write_text(str(error), encoding='utf-8')
        Path(models.ERROR_FILE).write_text(str(error), encoding='utf-8')
        raise
    failed = False
    try:
        h3.main()
    except Exception:
        failed = True
        print('H3 download failed; continuing with Qwen if storage permits', flush=True)
    try:
        ensure_space(root, qwen.selected_specs('qwen21'))
        subprocess.run([sys.executable, qwen.__file__, '--models', 'qwen21', '--root', root], check=True)
    except Exception as error:
        ERROR_FILE.write_text(str(error), encoding='utf-8')
        raise
    if failed:
        raise RuntimeError('Qwen models are ready, but H3 download failed; see kendo-model-download.log')


if __name__ == '__main__':
    main()
