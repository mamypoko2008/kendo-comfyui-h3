#!/usr/bin/env bash
set -Eeuo pipefail

workspace_dir="${KENDO_WORKSPACE:-/workspace}"
comfyui_dir="${KENDO_COMFYUI_DIR:-$workspace_dir/runpod-slim/ComfyUI}"
baked_dir="/opt/comfyui-baked"
args_file="${KENDO_ARGS_FILE:-$workspace_dir/runpod-slim/comfyui_args.txt}"
venv_dir="${KENDO_VENV_DIR:-$comfyui_dir/.venv-vast-cu130}"
page_port="${KENDO_PAGE_PORT:-3000}"
comfy_port="${KENDO_COMFY_PORT:-8188}"

export KENDO_MODEL_ROOT="${KENDO_MODEL_ROOT:-$comfyui_dir/models}"
export KENDO_READY_FILE="${KENDO_READY_FILE:-$workspace_dir/.kendo-h3-v2-models-ready}"
export KENDO_ERROR_FILE="${KENDO_ERROR_FILE:-$workspace_dir/.kendo-h3-v2-models-error}"

echo "[KENDO Vast V2] Preparing MiniMax H3 environment"
mkdir -p "$workspace_dir" "$(dirname "$comfyui_dir")"

if [[ ! -f "$comfyui_dir/main.py" ]]; then
  rm -rf "$comfyui_dir"
  cp -a "$baked_dir" "$comfyui_dir"
  echo "[KENDO Vast V2] Copied baked ComfyUI ${KENDO_IMAGE_VERSION:-vast-v2.1.2-1} to workspace"
fi

for node in ComfyUI-VideoHelperSuite ComfyUI-ALLinONE-MinimaxH3; do
  if [[ ! -d "$comfyui_dir/custom_nodes/$node" ]]; then
    cp -a "$baked_dir/custom_nodes/$node" "$comfyui_dir/custom_nodes/$node"
    echo "[KENDO Vast V2] Restored required node: $node"
  fi
done

mkdir -p "$(dirname "$args_file")"
touch "$args_file"
grep -vxF -- '--use-sage-attention' "$args_file" > "${args_file}.tmp" || true
mv "${args_file}.tmp" "$args_file"

add_arg() {
  if ! grep -qxF -- "$1" "$args_file"; then
    echo "$1" >> "$args_file"
  fi
}

add_arg '--enable-cors-header'
add_arg '--max-upload-size'
add_arg '512'

sage_mode="${KENDO_ENABLE_SAGE:-auto}"
if [[ "$sage_mode" == "auto" ]]; then
  if python3.12 - <<'PY'
import torch
import sageattention
raise SystemExit(0 if torch.cuda.is_available() and torch.cuda.get_device_capability()[0] >= 12 else 1)
PY
  then
    sage_mode=1
  else
    sage_mode=0
  fi
fi
if [[ "$sage_mode" == "1" ]]; then
  add_arg '--use-sage-attention'
  echo "[KENDO Vast V2] SageAttention enabled"
else
  echo "[KENDO Vast V2] Using native ComfyUI attention"
fi

python3.12 - <<'PY'
import sys
import torch

if not torch.cuda.is_available():
    sys.exit('[KENDO Vast V2] CUDA GPU is not visible inside the container. Use a GPU offer and NVIDIA runtime.')

name = torch.cuda.get_device_name(0)
capability = '.'.join(map(str, torch.cuda.get_device_capability(0)))
print(f'[KENDO Vast V2] GPU: {name}; CUDA runtime: {torch.version.cuda}; capability: {capability}', flush=True)
PY

if [[ "${KENDO_AUTO_DOWNLOAD_MODELS:-1}" == "1" ]]; then
  if [[ "${KENDO_WAIT_FOR_MODELS:-0}" == "1" ]]; then
    echo "[KENDO Vast V2] Waiting for MiniMax H3 models before starting services"
    /opt/kendo/download-models.sh \
      > >(tee "$workspace_dir/kendo-model-download.log") 2>&1
  else
    nohup /opt/kendo/download-models.sh \
      > "$workspace_dir/kendo-model-download.log" 2>&1 &
    echo "[KENDO Vast V2] Model downloader started; log: $workspace_dir/kendo-model-download.log"
  fi
fi

nohup python3.12 /opt/kendo/page_server.py \
  > "$workspace_dir/kendo-page.log" 2>&1 &
echo "[KENDO Vast V2] Page started on port $page_port"

if [[ ! -x "$venv_dir/bin/python" ]]; then
  echo "[KENDO Vast V2] Creating portable ComfyUI environment"
  python3.12 -m venv --system-site-packages "$venv_dir"
fi

mapfile -t comfy_args < <(sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e '/^$/d' "$args_file")

cd "$comfyui_dir"
echo "[KENDO Vast V2] Starting ComfyUI on port $comfy_port"
exec "$venv_dir/bin/python" main.py \
  --listen 0.0.0.0 \
  --port "$comfy_port" \
  "${comfy_args[@]}"
