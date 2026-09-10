"""Shared manifest for the v3 beta downloader and readiness endpoint."""
import os

MODEL_ROOT = os.environ.get('KENDO_MODEL_ROOT', '/workspace/runpod-slim/ComfyUI/models')
READY_FILE = '/workspace/.kendo-h3-v3-beta-models-ready'
ERROR_FILE = '/workspace/.kendo-h3-v3-beta-models-error'
H3_REPO = 'https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/'
FLASHVSR_REPO = 'https://huggingface.co/1038lab/FlashVSR/resolve/main/'
BASE_MODEL_SPECS = (
    ('diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors', 20970379616, H3_REPO + 'diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors'),
    ('text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors', 15687142551, H3_REPO + 'text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors'),
    ('vae/minimax_h3_video_vae_fp16.safetensors', 5207808496, H3_REPO + 'vae/minimax_h3_video_vae_fp16.safetensors'),
    ('vae/minimax_h3_audio_vae_fp32.safetensors', 605254808, H3_REPO + 'vae/minimax_h3_audio_vae_fp32.safetensors'),
    ('loras/minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors', 1956193000, H3_REPO + 'loras/minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors'),
)
UPSCALE_MODEL_SPECS = (
    ('FlashVSR/FlashVSR1_1.safetensors', 5676070392, FLASHVSR_REPO + 'FlashVSR1_1.safetensors'),
    ('FlashVSR/LQ_proj_in.safetensors', 575692496, FLASHVSR_REPO + 'LQ_proj_in.safetensors'),
    ('FlashVSR/Prompt.safetensors', 4194392, FLASHVSR_REPO + 'Prompt.safetensors'),
    ('FlashVSR/TCDecoder.safetensors', 181359724, FLASHVSR_REPO + 'TCDecoder.safetensors'),
    ('FlashVSR/Wan2.1_VAE.safetensors', 253815318, FLASHVSR_REPO + 'Wan2.1_VAE.safetensors'),
)
MODEL_SPECS = BASE_MODEL_SPECS + UPSCALE_MODEL_SPECS

def specs_ready(specs):
    return all(os.path.isfile(os.path.join(MODEL_ROOT, p)) and os.path.getsize(os.path.join(MODEL_ROOT, p)) == size for p, size, _url in specs)

def base_files_ready():
    return specs_ready(BASE_MODEL_SPECS)

def upscale_files_ready():
    return specs_ready(UPSCALE_MODEL_SPECS)

def files_ready():
    return base_files_ready() and upscale_files_ready()
