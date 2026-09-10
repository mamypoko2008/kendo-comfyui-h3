# Kendo-ComfyUI-H3 Fast v3 beta

Separate beta release. Existing v1 and v2 images and RunPod templates remain unchanged.

## Release

- Image: `ghcr.io/mamypoko2008/kendo-comfyui-h3:v3.0.0-beta.6`
- Base: tested v1.1.5 CUDA 13 / ComfyUI / SageAttention stack
- H3: Ref2VA INT8 with the full Ref2VA Turbo LoRA
- Default H3 steps: 10, adjustable
- References: 9 images, 1 video, 3 audio clips

## Video upscale

- Optional FlashVSR 1.1 stage after H3 VAE decode
- Native H3 source is locked to 1344x768 or 768x1344 while inline upscale is enabled
- 2x and 4x output choices
- Fast, Balanced, Long Video, and High Quality presets
- Generated audio is passed through to the upscaled output
- Every completed clip has a separate Upscale button, which runs FlashVSR without regenerating H3
- Work history displays the video and actions only; prompts are not rendered or stored in v3 history
- SageAttention already included in the base image is detected automatically by FlashVSR

FlashVSR custom node is pinned to commit `8877fdd593ea93b27353956dc69edf423c561fee`.

## First launch

Five FlashVSR files add 6,691,132,322 bytes to the existing H3 model set. Downloads are resumable and run in parallel. H3 readiness and FlashVSR readiness are independent: normal H3 generation becomes available as soon as the H3 files and ComfyUI are ready, while upscale controls wait for the extra models.

GPU generation and upscale still require a live RTX 5090 or RTX PRO 6000 Blackwell verification before the beta is promoted to a stable release.

## Published beta

- Repository commit: `492d1f1`
- Release tag: `v3.0.0-beta.5`
- GitHub Actions: https://github.com/mamypoko2008/kendo-comfyui-h3/actions/runs/34459711423
- Image digest: `sha256:4f71e5cfccbcca95f4edf38d829e4ca16ba3b5e9727d1696dd47d3f29f226f0f`
- RunPod template: `Kendo-ComfyUI-H3 Fast v3 beta`
- RunPod template ID: `ok09ni9573`
- Visibility: Public
- Service names in the template README: Port 3000 `Page`, Port 8188 `Comfy`, Port 8888 `JupyterLab`
- RunPod's Connect dialog controls the built-in `HTTP Service` button labels; custom per-port button labels are not part of the template API.

## beta.4 startup fix

The v3 wrapper now verifies that `ComfyUI/main.py` exists and restores the baked ComfyUI tree before linking the FlashVSR custom node. This repairs incomplete persistent volumes created by beta.3 while preserving downloaded models and user files.

The public RunPod template now points to `v3.0.0-beta.4`. Existing Pods created from an earlier image must be redeployed to run beta.4.

## beta.5 upscale workspace

- Removes FlashVSR from the image and generated workflows.
- An Upscale action selects its history clip and opens a dedicated workspace before any job is submitted.
- Fast mode uses `RealESRGAN_x2plus.pth` for frame-based 2x upscaling.
- Quality mode uses SeedVR2 3B FP8 with 1080p and 1440p targets, tiled VAE processing, CPU offload, and source-audio passthrough.
- H3, Fast Upscale, and Quality Upscale readiness are independent. H3 generation and the 67 MB Fast model do not wait for the 3.89 GB SeedVR2 download.
- The public v3 RunPod template now points to beta.5. Live GPU quality and performance still require verification before promotion to stable.

## beta.6 SeedVR2 validation fix

- Limits the SeedVR2 upscale seed to the node's supported unsigned 32-bit range (`0` to `4,294,967,295`).
- Upscaling remains prompt-free; the fix prevents ComfyUI from rejecting the workflow before execution.
