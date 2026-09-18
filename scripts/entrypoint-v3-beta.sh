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

for old_node in ComfyUI-FlashVSR Nvidia_RTX_Nodes_ComfyUI ComfyUI-SeedVR2_VideoUpscaler ComfyUI-KJNodes; do
  old_target="$comfyui_dir/custom_nodes/$old_node"
  if [[ -L "$old_target" ]]; then
    rm "$old_target"
  fi
done
args_file=/workspace/runpod-slim/comfyui_args.txt
mkdir -p "$(dirname "$args_file")"
touch "$args_file"
# v3 beta.11 uses native ComfyUI attention only. Remove a persisted global
# Sage flag when an existing v3 workspace is reused.
sed -i '/^--use-sage-attention$/d' "$args_file"
if ! grep -q -- '--max-upload-size' "$args_file"; then
  echo '--max-upload-size 512' >> "$args_file"
fi
exec /opt/kendo/entrypoint.sh
