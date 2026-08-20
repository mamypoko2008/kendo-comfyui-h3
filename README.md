# KENDO MiniMax H3 — RunPod Custom Image

One-click RunPod image for MiniMax H3 on RTX 5090 and RTX PRO 6000 Blackwell.

## Included

- RunPod ComfyUI CUDA 13 base, pinned to `runpod/comfyui:1.4.4-cuda13.0`
- ComfyUI `v0.33.2`
- ComfyUI-Manager and ComfyUI-KJNodes from the RunPod base image
- ComfyUI-VideoHelperSuite
- ComfyUI-ALLinONE-MinimaxH3
- SageAttention 2.2.0 compiled for Blackwell `sm_120a`
- Background, resumable download of the five H3 model files
- Official local MiniMax H3 text-to-video and image-to-video workflows

Models are stored under `/workspace/runpod-slim/ComfyUI/models` and are not
baked into the container image. The first deployment starts ComfyUI immediately
while downloading models in the background. Follow progress with:

```bash
tail -f /workspace/kendo-model-download.log
```

The marker `/workspace/.kendo-h3-models-ready` is created when all downloads
pass minimum-size validation.

## Build and push

Replace `YOUR_DOCKERHUB_USER` with the registry account used by the course:

```bash
docker build --platform linux/amd64 \
  -t YOUR_DOCKERHUB_USER/kendo-comfyui-h3:1.0.0 .

docker push YOUR_DOCKERHUB_USER/kendo-comfyui-h3:1.0.0
```

SageAttention compilation is CPU-heavy and may make the first Docker build
slow. It happens at image-build time, not on student Pods.

Alternatively, push this directory to GitHub and create the tag `v1.0.0`.
The included GitHub Actions workflow publishes:

```text
ghcr.io/YOUR_GITHUB_USER/kendo-comfyui-h3:1.0.0
```

The package must be public, or RunPod must be configured with registry
credentials before it can pull the image.

## RunPod Template settings

| Setting | Value |
|---|---|
| Container image | `YOUR_DOCKERHUB_USER/kendo-comfyui-h3:1.0.0` |
| Container disk | 30 GB minimum |
| Volume / network volume | 100 GB minimum, mounted at `/workspace` |
| HTTP ports | `8080,8188,8888` |
| TCP ports | `22` |
| Docker command | Leave empty |
| Sage | `KENDO_ENABLE_SAGE=1` |
| Model download | `KENDO_AUTO_DOWNLOAD_MODELS=1` |
| Wait for models | `KENDO_WAIT_FOR_MODELS=1` |

Use RTX 5090 or RTX PRO 6000 Blackwell. Both expose compute capability 12.0,
which matches the baked SageAttention kernel.

## First-deploy verification

```bash
/workspace/runpod-slim/ComfyUI/.venv-cu128/bin/python - <<'PY'
import torch
import sageattention

print("GPU:", torch.cuda.get_device_name())
print("Capability:", torch.cuda.get_device_capability())
print("Torch:", torch.__version__, "CUDA:", torch.version.cuda)
print("SageAttention:", sageattention.__file__)
PY

curl -fsS http://127.0.0.1:8188/system_stats
```

Run one short H3 generation before publishing the deploy link.

## Operational notes

- Do not run `pkill -f main.py`. The RunPod base entrypoint does not restart an
  unexpectedly exited ComfyUI process; restart the Pod instead.
- Do not use the floating `cuda13.0` base tag for a course release. Update the
  pinned base only after testing a new image tag.
- To disable Sage for diagnostics, set `KENDO_ENABLE_SAGE=0` and remove the
  existing `--use-sage-attention` line from `comfyui_args.txt` on an attached
  volume.
- Model downloads use `.part` files and atomic rename. Undersized existing files
  are preserved with an `.incomplete.<timestamp>` suffix rather than deleted.
- With `KENDO_WAIT_FOR_MODELS=1` (the default), RunPod services remain in
  `Initializing` until all five model files pass their minimum-size checks.
  Set it to `0` only when background downloading is explicitly preferred.
