# Kendo MiniMax H3 V2 for Vast.ai

This is a separate Vast.ai build of the stable RunPod V2. It keeps the V2 UI,
workflow, reference limits, seed controls, models, and prompt-free history while
removing the runtime dependency on RunPod's `/start.sh`.

## Image

`ghcr.io/mamypoko2008/kendo-comfyui-h3:vast-v2.1.2-1`

## Vast.ai template settings

- Launch mode: **Entrypoint**
- Disk space: **100 GB minimum**
- Docker image: use the image above
- Docker create/run options:

  `-p 3000:3000 -p 8188:8188 -e KENDO_AUTO_DOWNLOAD_MODELS=1 -e KENDO_WAIT_FOR_MODELS=0 -e KENDO_ENABLE_SAGE=auto`

Port 3000 is the Kendo Page. Port 8188 is direct ComfyUI access. Vast maps
these container ports to public host ports; use the **IP Port Info** dialog on
the instance to see the assigned addresses.

Do not select Vast's SSH or Jupyter launch mode for this image. Those launch
modes can replace the image startup command, preventing Kendo and ComfyUI from
starting. Use Entrypoint mode, then use the container logs for diagnosis.

## GPU requirements

This image inherits the CUDA 13 / PyTorch cu130 V2 runtime. Select a Vast offer
with a CUDA 13-compatible NVIDIA driver. The original V2 SageAttention kernel
is optimized for Blackwell (compute capability 12.x). `KENDO_ENABLE_SAGE=auto`
enables it on compatible Blackwell GPUs and falls back to native ComfyUI
attention on other supported GPUs.

For the closest behavior to the original V2, use an RTX 5090, RTX PRO 6000
Blackwell, or another compatible Blackwell GPU. GPU memory requirements depend
on duration, resolution, and reference count.

## First launch

The first launch downloads and verifies approximately 44.4 GB of H3 models to:

`/workspace/runpod-slim/ComfyUI/models`

Downloads resume after interruption. The Page can open before all models are
ready and reports download readiness. Logs are available at:

- `/workspace/kendo-model-download.log`
- `/workspace/kendo-page.log`
- Vast container logs for ComfyUI startup and CUDA errors

Set `KENDO_WAIT_FOR_MODELS=1` if ComfyUI should wait until every model has been
downloaded and verified before starting.

## Troubleshooting

- **Container exits immediately:** verify Launch mode is Entrypoint and inspect
  the first CUDA message in the container log.
- **CUDA GPU is not visible:** the offer/runtime did not pass an NVIDIA GPU into
  the container.
- **Driver or CUDA mismatch:** select a host advertising a CUDA 13-compatible
  driver. A CUDA 12-only host is not suitable for this image.
- **Page does not open:** verify port 3000 was included in Docker options and
  use the mapped public port shown by Vast, not necessarily public port 3000.
- **ComfyUI is not ready yet:** check the model download log. The initial model
  set is large and startup speed depends on the host's network and disk.
- **SageAttention failure:** set `KENDO_ENABLE_SAGE=0` and redeploy to use native
  attention.

## Security

Direct ports opened with `-p` are publicly reachable and this image does not add
Vast Portal authentication. Do not expose a long-running production instance
without adding authentication, firewall controls, or an SSH tunnel. Port 8188
is optional; omit `-p 8188:8188` if only the Kendo Page is needed.

