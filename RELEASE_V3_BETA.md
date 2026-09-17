# Kendo-ComfyUI-H3 Fast v3 beta

Separate beta release. Existing v1 and v2 images and RunPod templates remain unchanged.

## Release

- Image: `ghcr.io/mamypoko2008/kendo-comfyui-h3:v3.0.0-beta.10`
- Base: tested v1.1.5 CUDA 13 / ComfyUI / SageAttention stack
- H3: standard ComfyUI Ref2VA INT8 graph with the full Ref2VA Turbo LoRA
- Attention: explicit `Patch Sage Attention KJ` node (`auto`, compile disabled)
- Creative LoRA: fal Realism People, enabled by default at `0.75`
- Default H3 steps: 10, adjustable
- References: 9 images, 1 video, 3 audio clips

## Interface

- Matches the current v2 layout, including responsive width, large image previews, seed locking, and prompt-free history.
- Video Ref and Seed Lock are off by default.
- The Realism People LoRA can be toggled and its weight adjusted from `0` to `2`.
- When enabled, the recommended `r34l1sm` trigger is added internally without modifying the visible prompt.

## First launch

H3 models, the Turbo LoRA, and the 131 MB Realism People LoRA download resumably and in parallel. Removed upscaler models are no longer downloaded.

GPU generation and upscale still require live verification before the beta is promoted to a stable release.

## beta.10 clean generation stack

- Removes the v3 upscaler UI, workflows, models, and SeedVR2 custom-node dependency.
- Rebuilds generation from the known v2 graph with standard ComfyUI H3 nodes.
- Adds pinned KJNodes v1.5.2 and applies SageAttention inside the workflow instead of the global launch flag.
- Adds fal MiniMax H3 Realism People LoRA with a default weight of 0.75.
- Restores the v2 interface, seed controls, larger attachment thumbnails, and default-off Video Ref.
- Keeps v1 and v2 images/templates unchanged.

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

## beta.7 NVIDIA RTX VSR

- Adds the official RTX Video Super Resolution node as the default 2x upscaler at Ultra quality.
- Keeps Real-ESRGAN and SeedVR2 selectable without changing their workflows.
- Adds no startup model download; the NVIDIA VFX runtime is installed in the image.
- Keeps v1, v2, and their RunPod templates unchanged.

## beta.8 RTX DynamicCombo fix

- Sends RTX VSR's ComfyUI v3 DynamicCombo as flat live-input keys: `resize_type` and `resize_type.scale`.
- Fixes `RTXVideoSuperResolution.execute() missing ... resize_type` without changing the RTX node or other upscalers.
- Adds a regression assertion for the exact API payload and keeps v1/v2 unchanged.

## beta.9 RTX VSR removal

- Removes the NVIDIA RTX VSR node, runtime dependency, workflow, and UI option after live RunPod testing reached upstream `NvVFX_Load` initialization error `-12`.
- Restores Real-ESRGAN 2x as the default clip upscaler and keeps SeedVR2 as the quality option.
- Cleans up only the old RTX symlink from persistent v3 workspaces; user-installed directories are preserved.
- Keeps v1, v2, generation settings, reference limits, prompt-free history, and the standalone upscale workspace unchanged.
