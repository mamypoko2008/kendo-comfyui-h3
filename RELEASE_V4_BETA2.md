# Kendo-ComfyUI-H3 V4 beta.2

V4 beta.2 is a new, isolated RunPod line. It does not replace the existing V2,
V3 beta, V4 quality or V4 image templates.

## Experience

- New responsive Kendo Studio layout with explicit **Fast** and
  **High Resolution** mode cards.
- Fast is the default and keeps the stable single-pass V3 behavior.
- High Resolution displays its base resolution, latent scale and estimated
  output size before the job is submitted.
- Independent 1.5x / 2x latent scale, Realism People and Facial Detail LoRA
  toggles, seed lock, GPU/Sage status, queue, MCP card, prompt-free history and
  bottom Comfy console.
- V4 beta.2 browser history uses its own storage key.

## High Resolution graph

1. Generate the early/high-sigma portion at a 0.4, 0.5 or 0.7 MP base.
2. Take `denoised_output`, separate the H3 video and audio latents, and keep the
   original audio latent unchanged.
3. Upscale the 24-channel video latent with the pinned H3 3D BF16 upscaler.
4. Recombine video and audio, then sample the low-sigma tail at the target size.
5. Decode once and save through the existing H3 video/audio path.

The high-resolution scheduler is beta/euler with one cosine low-sigma refinement
step. The default UI recommendation is 8 steps with a split at step 4.

## Pinned additions

- `LBH-123-AI/Comfyui_Minimax_h3_latent_Upscaler` commit `40316cf...`
- `yichengup/ComfyUI-YCNodes-MiniMax-H3` commit `efbe83f...`
- `minimax_h3_latent_upscaler_3d_conv_v1_bf16.safetensors` (690,592,992 bytes)
- Realism People LoRA (131,229,656 bytes)
- Facial Realism CloseUp LoRA (74,570,624 bytes)

The downloader verifies exact file sizes and resumes partial downloads. The
RunPod definition requests a 120 GB persistent volume.

## Attention and memory

Global Sage remains the default. The workflow does not stack the KJ patch when
Global Sage is selected. KJ Memory Sage is an explicit fallback. Latent upscale
reduces time relative to native full-resolution generation, not peak sampling
VRAM; RTX PRO 6000 96 GB is recommended for long 2x renders.

## Files

- `Dockerfile.v4-beta2`
- `runpod-v4-beta2.json`
- `web/v4-beta2.*`, `web/workflow-v4-beta2.js`
- `scripts/models_v4_beta2.py`, `scripts/download_models_v4_beta2.py`
- `scripts/page_server_v4_beta2.py`, `scripts/entrypoint-v4-beta2.sh`

## Validation

- Pure workflow tests cover Fast, dual pass, audio preservation, sigma split,
  optional LoRAs, attention modes and reference inputs.
- Existing V3 workflow and MCP suites remain green.
- The V4 beta.2 page is checked in Edge for mode switching, graph output,
  Sage/GPU status and mobile overflow.
- GPU inference, peak VRAM, visual quality and elapsed time still require a real
  RunPod Pod before this beta should replace a production template.
