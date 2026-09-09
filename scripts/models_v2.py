"""Shared manifest for the v2 downloader and readiness endpoint."""
import os

MODEL_ROOT = os.environ.get('KENDO_MODEL_ROOT', '/workspace/runpod-slim/ComfyUI/models')
READY_FILE = '/workspace/.kendo-h3-v2-models-ready'
ERROR_FILE = '/workspace/.kendo-h3-v2-models-error'
REPO = 'https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/'
MODEL_SPECS = (
    ('diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors', 20970379616),
    ('text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors', 15687142551),
    ('vae/minimax_h3_video_vae_fp16.safetensors', 5207808496),
    ('vae/minimax_h3_audio_vae_fp32.safetensors', 605254808),
    ('loras/minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors', 1956193000),
)

def files_ready():
    return all(os.path.isfile(os.path.join(MODEL_ROOT, p)) and os.path.getsize(os.path.join(MODEL_ROOT, p)) == size for p, size in MODEL_SPECS)
