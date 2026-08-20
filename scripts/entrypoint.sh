#!/usr/bin/env bash
set -Eeuo pipefail

COMFYUI_DIR="/workspace/runpod-slim/ComfyUI"
BAKED_DIR="/opt/comfyui-baked"
ARGS_FILE="/workspace/runpod-slim/comfyui_args.txt"

echo "[KENDO] Preparing MiniMax H3 environment"

# The model downloader needs the persistent model folders before RunPod's base
# entrypoint runs. Copying the baked tree here avoids creating an incomplete
# ComfyUI directory that the base entrypoint would otherwise mistake as ready.
if [[ ! -d "$COMFYUI_DIR" ]]; then
  mkdir -p "$(dirname "$COMFYUI_DIR")"
  cp -a "$BAKED_DIR" "$COMFYUI_DIR"
  echo "[KENDO] Copied baked ComfyUI ${KENDO_IMAGE_VERSION:-1.0.0} to workspace"
fi

# Preserve user-managed nodes, but make sure image-required nodes exist when an
# older network volume is attached to this image.
for node in ComfyUI-VideoHelperSuite ComfyUI-ALLinONE-MinimaxH3; do
  if [[ ! -d "$COMFYUI_DIR/custom_nodes/$node" ]]; then
    cp -a "$BAKED_DIR/custom_nodes/$node" "$COMFYUI_DIR/custom_nodes/$node"
    echo "[KENDO] Restored required node: $node"
  fi
done

mkdir -p "$(dirname "$ARGS_FILE")"
touch "$ARGS_FILE"
if [[ "${KENDO_ENABLE_SAGE:-1}" == "1" ]] && \
   ! grep -qxF -- "--use-sage-attention" "$ARGS_FILE"; then
  echo "--use-sage-attention" >> "$ARGS_FILE"
fi
if ! grep -qxF -- "--enable-cors-header" "$ARGS_FILE"; then
  echo "--enable-cors-header" >> "$ARGS_FILE"
fi

if [[ "${KENDO_AUTO_DOWNLOAD_MODELS:-1}" == "1" ]]; then
  if [[ "${KENDO_WAIT_FOR_MODELS:-1}" == "1" ]]; then
    echo "[KENDO] Waiting for all MiniMax H3 models before starting services"
    /opt/kendo/download-models.sh \
      > >(tee /workspace/kendo-model-download.log) 2>&1
    echo "[KENDO] Models verified; starting ComfyUI services"
  else
    nohup /opt/kendo/download-models.sh \
      > /workspace/kendo-model-download.log 2>&1 &
    echo "[KENDO] Model downloader started in background; log: /workspace/kendo-model-download.log"
  fi
fi

nohup python3.12 -m http.server 3000 --bind 0.0.0.0 --directory /opt/kendo-page \
  > /workspace/kendo-page.log 2>&1 &
echo "[KENDO] Page started on port 3000"

# Delegate SSH, FileBrowser, Jupyter, venv creation, upgrades, and the ComfyUI
# foreground process to the tested RunPod entrypoint.
exec /start.sh
