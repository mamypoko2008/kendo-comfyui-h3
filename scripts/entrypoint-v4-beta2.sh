#!/usr/bin/env bash
set -Eeuo pipefail

COMFYUI_DIR=/workspace/runpod-slim/ComfyUI
BAKED_DIR=/opt/comfyui-baked

# Existing persistent volumes may predate beta.2. Restore only the two new,
# pinned node packs and preserve every user-managed node already on the volume.
if [[ -d "$COMFYUI_DIR" ]]; then
  for node in Comfyui_Minimax_h3_latent_Upscaler ComfyUI-YCNodes-MiniMax-H3; do
    if [[ ! -d "$COMFYUI_DIR/custom_nodes/$node" ]]; then
      cp -a "$BAKED_DIR/custom_nodes/$node" "$COMFYUI_DIR/custom_nodes/$node"
      echo "[KENDO V4 beta.2] Restored required node: $node"
    fi
  done
fi

exec /opt/kendo/entrypoint-v3-beta.sh
