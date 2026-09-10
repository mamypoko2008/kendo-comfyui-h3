#!/usr/bin/env bash
set -Eeuo pipefail
node_source=/opt/kendo/custom_nodes/ComfyUI-FlashVSR
node_target=/workspace/runpod-slim/ComfyUI/custom_nodes/ComfyUI-FlashVSR
mkdir -p "$(dirname "$node_target")"
if [[ ! -e "$node_target" && ! -L "$node_target" ]]; then
  ln -s "$node_source" "$node_target"
fi
args_file=/workspace/runpod-slim/comfyui_args.txt
mkdir -p "$(dirname "$args_file")"
touch "$args_file"
if ! grep -q -- '--max-upload-size' "$args_file"; then
  echo '--max-upload-size 512' >> "$args_file"
fi
exec /opt/kendo/entrypoint.sh
