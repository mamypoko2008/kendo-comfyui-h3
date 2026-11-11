#!/usr/bin/env bash
set -Eeuo pipefail

COMFYUI_DIR=/workspace/runpod-slim/ComfyUI
BAKED_DIR=/opt/comfyui-baked
MARKER=.kendo-v4-beta3-core

# A V4 beta.2 volume contains an older ComfyUI core. Merge the pinned native
# H3 Image core in place while preserving models, input, output and user nodes.
if [[ -d "$COMFYUI_DIR" ]] && ! cmp -s "$BAKED_DIR/$MARKER" "$COMFYUI_DIR/$MARKER"; then
  echo '[KENDO V4 beta.3] Updating ComfyUI core for native H3 Image; user data is preserved.'
  cp -a "$BAKED_DIR/." "$COMFYUI_DIR/"
fi

exec /opt/kendo/entrypoint-v3-beta.sh
