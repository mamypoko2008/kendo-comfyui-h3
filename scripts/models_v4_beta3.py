"""Pinned MiniMax H3 video + official H3 Image INT8 manifest for V4 beta.3."""
import os

MODEL_ROOT = os.environ.get('KENDO_MODEL_ROOT', '/workspace/runpod-slim/ComfyUI/models')
READY_FILE = '/workspace/.kendo-h3-v4-beta3-models-ready'
ERROR_FILE = '/workspace/.kendo-h3-v4-beta3-models-error'
VIDEO_REPO = 'https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/'
IMAGE_REPO = 'https://huggingface.co/Comfy-Org/MiniMax-H3-Image/resolve/main/'

VIDEO_SPECS = (
    ('diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors', 20970379616),
    ('text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors', 15687142551),
    ('vae/minimax_h3_video_vae_fp16.safetensors', 5207808496),
    ('vae/minimax_h3_audio_vae_fp32.safetensors', 605254808),
    ('loras/minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors', 1956193000),
)
IMAGE_SPECS = (
    ('diffusion_models/minimax_h3_image_pruned_int8_convrot.safetensors', 20979314802),
    ('text_encoders/qwen3vl_32b_minimax_h3_int8_convrot.safetensors', 27141342152),
    ('vae/minimax_h3_image_vae_fp16.safetensors', 1168505312),
)
MODEL_SPECS = VIDEO_SPECS + IMAGE_SPECS

def model_url(relative):
    repo = IMAGE_REPO if relative in {path for path, _ in IMAGE_SPECS} else VIDEO_REPO
    return repo + relative + '?download=true'

def specs_ready(specs):
    return all(os.path.isfile(os.path.join(MODEL_ROOT, path)) and os.path.getsize(os.path.join(MODEL_ROOT, path)) == size for path, size in specs)

def files_ready():
    return specs_ready(MODEL_SPECS)

def video_ready():
    return specs_ready(VIDEO_SPECS)

def image_ready():
    return specs_ready(IMAGE_SPECS)
