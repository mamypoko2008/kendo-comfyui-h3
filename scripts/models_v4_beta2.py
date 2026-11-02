"""Pinned model manifest for Kendo H3 V4 beta.2."""
import os

MODEL_ROOT = os.environ.get('KENDO_MODEL_ROOT', '/workspace/runpod-slim/ComfyUI/models')
READY_FILE = '/workspace/.kendo-h3-v4-beta2-models-ready'
ERROR_FILE = '/workspace/.kendo-h3-v4-beta2-models-error'

SOURCES = {
    'comfy': 'https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/',
    'singularity': 'https://huggingface.co/WarmBloodAban/Minimax-h3_Singularity/resolve/main/',
    'realism': 'https://huggingface.co/fal/MiniMax-H3-Realism-People-LoRA/resolve/main/',
    'facial': 'https://huggingface.co/prithivMLmods/MiniMax-H3-Facial-Realism-CloseUp/resolve/main/',
    'upscaler': 'https://huggingface.co/LBH-123-AI/Minimax_h3_latent_Upscaler/resolve/main/'
}

# Keep this public shape compatible with the stable V3 page/status handler.
# (local relative path, exact bytes)
MODEL_SPECS = (
    ('diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors', 20970379616),
    ('diffusion_models/Minimax-h3_Singularity_ref2va_v2_pruned_int8.safetensors', 20967647456),
    ('text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors', 15687142551),
    ('vae/minimax_h3_video_vae_fp16.safetensors', 5207808496),
    ('vae/minimax_h3_audio_vae_fp32.safetensors', 605254808),
    ('loras/minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors', 1956193000),
    ('loras/h3-realism-people-t2v-i2v-r2v.safetensors', 131229656),
    ('loras/minimax-h3-facial-realism-closeup-cp2000.safetensors', 74570624),
    ('latent_upscale_models/minimax_h3_latent_upscaler_3d_conv_v1_bf16.safetensors', 690592992),
)

REMOTES = {
    'diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors': ('comfy', 'diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors'),
    'diffusion_models/Minimax-h3_Singularity_ref2va_v2_pruned_int8.safetensors': ('singularity', 'Minimax-h3_Singularity_ref2va_v2_pruned_int8.safetensors'),
    'text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors': ('comfy', 'text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors'),
    'vae/minimax_h3_video_vae_fp16.safetensors': ('comfy', 'vae/minimax_h3_video_vae_fp16.safetensors'),
    'vae/minimax_h3_audio_vae_fp32.safetensors': ('comfy', 'vae/minimax_h3_audio_vae_fp32.safetensors'),
    'loras/minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors': ('comfy', 'loras/minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors'),
    'loras/h3-realism-people-t2v-i2v-r2v.safetensors': ('realism', 'h3-realism-people-t2v-i2v-r2v.safetensors'),
    'loras/minimax-h3-facial-realism-closeup-cp2000.safetensors': ('facial', 'minimax-h3-facial-realism-closeup-cp2000.safetensors'),
    'latent_upscale_models/minimax_h3_latent_upscaler_3d_conv_v1_bf16.safetensors': ('upscaler', 'minimax_h3_latent_upscaler_3d_conv_v1/minimax_h3_latent_upscaler_3d_conv_v1_bf16.safetensors')
}

def model_url(spec):
    source, remote = REMOTES[spec[0]]
    return SOURCES[source] + remote + '?download=true'

def files_ready():
    return all(os.path.isfile(os.path.join(MODEL_ROOT, relative)) and
               os.path.getsize(os.path.join(MODEL_ROOT, relative)) == size
               for relative, size in MODEL_SPECS)
