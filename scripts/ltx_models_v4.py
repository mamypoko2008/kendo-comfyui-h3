"""The exact LTX-2.5/Refine stack selected by the user's official workflow."""
import os
from pathlib import Path

MODEL_ROOT = os.environ.get('KENDO_MODEL_ROOT', '/workspace/runpod-slim/ComfyUI/models')
ERROR_FILE = os.environ.get('KENDO_LTX_ERROR_FILE', '/workspace/.kendo-ltx-v4-models-error')
READY_FILE = '/workspace/.kendo-ltx-v4-models-ready'
MODEL_SPECS = (
    ('Lightricks/LTX-2.5', 'diffusion_models/ltx-2.5-22b-distilled-transformer-bf16.safetensors', 42018190584),
    ('Lightricks/LTX-2.5', 'text_encoders/gemma4-12b-with-proj-ltx-2.5-bf16.safetensors', 26263858182),
    ('Lightricks/LTX-2.5', 'vae/ltx-2.5-video-vae-bf16.safetensors', 1472223346),
    ('Lightricks/LTX-2.5-22b-IC-LoRA-Refine-Details', 'loras/ltx-2.5-22b-ic-lora-refine-details-1.0.safetensors', 1308787534),
)

def remote_name(repo, relative):
    return Path(relative).name if 'IC-LoRA' in repo else relative

def readiness():
    total = sum(size for _, _, size in MODEL_SPECS)
    downloaded, missing = 0, []
    for _, relative, size in MODEL_SPECS:
        target = Path(MODEL_ROOT, relative)
        partial = Path(str(target) + '.part')
        try:
            actual = target.stat().st_size
        except OSError:
            actual = -1
        if actual != size:
            missing.append(relative)
        try:
            downloaded += min(size, max(0, actual if actual >= 0 else partial.stat().st_size))
        except OSError:
            pass
    try:
        error = Path(ERROR_FILE).read_text(encoding='utf-8')
    except OSError:
        error = None
    return dict(models_ready=not missing, missing_models=missing, progress=round(downloaded * 100 / total, 1),
                downloaded_bytes=downloaded, total_bytes=total, download_error=error)
