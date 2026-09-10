"""Shared manifest for the v3 beta downloader and readiness endpoint."""
import os

MODEL_ROOT = os.environ.get('KENDO_MODEL_ROOT', '/workspace/runpod-slim/ComfyUI/models')
READY_FILE = '/workspace/.kendo-h3-v3-beta5-models-ready'
ERROR_FILE = '/workspace/.kendo-h3-v3-beta5-models-error'
H3_REPO = 'https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/'
SEEDVR2_REPO = 'https://huggingface.co/numz/SeedVR2_comfyUI/resolve/main/'
BASE_MODEL_SPECS = (
    ('diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors', 20970379616, H3_REPO + 'diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors'),
    ('text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors', 15687142551, H3_REPO + 'text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors'),
    ('vae/minimax_h3_video_vae_fp16.safetensors', 5207808496, H3_REPO + 'vae/minimax_h3_video_vae_fp16.safetensors'),
    ('vae/minimax_h3_audio_vae_fp32.safetensors', 605254808, H3_REPO + 'vae/minimax_h3_audio_vae_fp32.safetensors'),
    ('loras/minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors', 1956193000, H3_REPO + 'loras/minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors'),
)
FAST_UPSCALE_MODEL_SPECS = (
    ('upscale_models/RealESRGAN_x2plus.pth', 67061725,
     'https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.1/RealESRGAN_x2plus.pth'),
)
QUALITY_UPSCALE_MODEL_SPECS = (
    ('SEEDVR2/seedvr2_ema_3b_fp8_e4m3fn.safetensors', 3391544696,
     SEEDVR2_REPO + 'seedvr2_ema_3b_fp8_e4m3fn.safetensors'),
    ('SEEDVR2/ema_vae_fp16.safetensors', 501324814,
     SEEDVR2_REPO + 'ema_vae_fp16.safetensors'),
)
UPSCALE_MODEL_SPECS = FAST_UPSCALE_MODEL_SPECS + QUALITY_UPSCALE_MODEL_SPECS
MODEL_SPECS = BASE_MODEL_SPECS + UPSCALE_MODEL_SPECS

def specs_ready(specs):
    return all(os.path.isfile(os.path.join(MODEL_ROOT, p)) and os.path.getsize(os.path.join(MODEL_ROOT, p)) == size for p, size, _url in specs)

def base_files_ready():
    return specs_ready(BASE_MODEL_SPECS)

def upscale_files_ready():
    return specs_ready(UPSCALE_MODEL_SPECS)

def fast_upscale_files_ready():
    return specs_ready(FAST_UPSCALE_MODEL_SPECS)

def quality_upscale_files_ready():
    return specs_ready(QUALITY_UPSCALE_MODEL_SPECS)

def files_ready():
    return base_files_ready() and upscale_files_ready()
