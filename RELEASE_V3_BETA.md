# Kendo-ComfyUI-H3 Fast v3 beta

Separate beta release. Existing v1 and v2 images and RunPod templates remain unchanged.

## Release

- Image: `ghcr.io/mamypoko2008/kendo-comfyui-h3:v3.0.0-beta.4`
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

- Repository commit: `14c0946`
- Release tag: `v3.0.0-beta.4`
- GitHub Actions: https://github.com/mamypoko2008/kendo-comfyui-h3/actions/runs/34431599303
- Image digest: `sha256:9142d0181c690c4bda7f9a1ea1b8ef91c9a6bc3f9a07a0f2713eb87edaa1824a`
- RunPod template: `Kendo-ComfyUI-H3 Fast v3 beta`
- RunPod template ID: `ok09ni9573`
- Visibility: Public

## beta.4 startup fix

The v3 wrapper now verifies that `ComfyUI/main.py` exists and restores the baked ComfyUI tree before linking the FlashVSR custom node. This repairs incomplete persistent volumes created by beta.3 while preserving downloaded models and user files.

The public RunPod template now points to `v3.0.0-beta.4`. Existing Pods created from an earlier image must be redeployed to run beta.4.
