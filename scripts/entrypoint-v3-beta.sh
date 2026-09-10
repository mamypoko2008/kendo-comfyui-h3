#!/usr/bin/env bash
set -Eeuo pipefail
comfyui_dir=/workspace/runpod-slim/ComfyUI
baked_dir=/opt/comfyui-baked

# The optional upscaler link must not create the ComfyUI directory before the base
# bootstrap checks it. Repair an incomplete persistent tree first, preserving
# any models and user files already downloaded there.
if [[ ! -f "$comfyui_dir/main.py" ]]; then
  mkdir -p "$comfyui_dir"
  cp -a "$baked_dir/." "$comfyui_dir/"
  echo "[KENDO v3 beta] Restored the baked ComfyUI tree"
fi

old_flash="$comfyui_dir/custom_nodes/ComfyUI-FlashVSR"
if [[ -L "$old_flash" ]]; then
  rm "$old_flash"
fi
node_source=/opt/kendo/custom_nodes/ComfyUI-SeedVR2_VideoUpscaler
node_target="$comfyui_dir/custom_nodes/ComfyUI-SeedVR2_VideoUpscaler"
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
