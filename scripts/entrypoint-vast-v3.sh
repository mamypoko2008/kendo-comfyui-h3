#!/usr/bin/env bash
set -Eeuo pipefail

workspace_dir="${KENDO_WORKSPACE:-/workspace}"
comfyui_dir="${KENDO_COMFYUI_DIR:-$workspace_dir/runpod-slim/ComfyUI}"
baked_dir="/opt/comfyui-baked"
args_file="${KENDO_ARGS_FILE:-$workspace_dir/runpod-slim/comfyui_args.txt}"
venv_dir="${KENDO_VENV_DIR:-$comfyui_dir/.venv-vast-cu130}"
page_port="${KENDO_PAGE_PORT:-3000}"
mcp_port="${KENDO_MCP_PORT:-3001}"
comfy_port="${KENDO_COMFY_PORT:-8188}"
log_file="${KENDO_COMFY_LOG_FILE:-$workspace_dir/comfyui.log}"

export KENDO_MODEL_ROOT="${KENDO_MODEL_ROOT:-$comfyui_dir/models}"
export KENDO_MCP_HOST="${KENDO_MCP_HOST:-0.0.0.0}"
export KENDO_RUNTIME_FILE="${KENDO_RUNTIME_FILE:-$workspace_dir/kendo-runtime.json}"
export KENDO_COMFY_ARGS_FILE="$args_file"

echo "[KENDO Vast V3] Preparing MiniMax H3 beta.15 environment"
mkdir -p "$workspace_dir" "$(dirname "$comfyui_dir")"

if [[ ! -f "$comfyui_dir/main.py" ]]; then
  rm -rf "$comfyui_dir"
  cp -a "$baked_dir" "$comfyui_dir"
  echo "[KENDO Vast V3] Copied baked ComfyUI ${KENDO_IMAGE_VERSION:-vast-v3.0.0-beta.15-1} to workspace"
fi

for node in ComfyUI-VideoHelperSuite ComfyUI-ALLinONE-MinimaxH3; do
  if [[ ! -d "$comfyui_dir/custom_nodes/$node" ]]; then
    cp -a "$baked_dir/custom_nodes/$node" "$comfyui_dir/custom_nodes/$node"
    echo "[KENDO Vast V3] Restored required node: $node"
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

if [[ "${KENDO_ENABLE_SAGE:-auto}" == "0" ]]; then
  export KENDO_ENABLE_SAGE=0
else
  export KENDO_ENABLE_SAGE=1
fi
if python3.12 /opt/kendo/detect_runpod_runtime.py; then
  export KENDO_ENABLE_SAGE=1
else
  export KENDO_ENABLE_SAGE=0
fi

python3.12 - <<'PY'
import sys
import torch

if not torch.cuda.is_available():
    sys.exit('[KENDO Vast V3] CUDA GPU is not visible. Select a GPU offer with NVIDIA runtime.')
name = torch.cuda.get_device_name(0)
capability = '.'.join(map(str, torch.cuda.get_device_capability(0)))
print(f'[KENDO Vast V3] GPU: {name}; CUDA runtime: {torch.version.cuda}; capability: {capability}', flush=True)
PY

code_file="${KENDO_MCP_CODE_FILE:-$workspace_dir/.kendo-mcp-code}"
if [[ -z "${KENDO_MCP_CODE:-}" ]]; then
  if [[ ! -s "$code_file" ]]; then
    python3.12 -c 'import secrets; print("kendo-" + secrets.token_hex(8))' > "$code_file"
  fi
  export KENDO_MCP_CODE="$(tr -d '[:space:]' < "$code_file")"
fi

if [[ -n "${PUBLIC_IPADDR:-}" && -n "${VAST_TCP_PORT_3000:-}" ]]; then
  export KENDO_PUBLIC_PAGE_URL="${KENDO_PUBLIC_PAGE_URL:-http://${PUBLIC_IPADDR}:${VAST_TCP_PORT_3000}}"
fi
if [[ -n "${PUBLIC_IPADDR:-}" && -n "${VAST_TCP_PORT_3001:-}" ]]; then
  export KENDO_MCP_PUBLIC_URL="${KENDO_MCP_PUBLIC_URL:-http://${PUBLIC_IPADDR}:${VAST_TCP_PORT_3001}/mcp/{code}}"
fi
if [[ -n "${PUBLIC_IPADDR:-}" && -n "${VAST_TCP_PORT_8188:-}" ]]; then
  export KENDO_COMFY_PUBLIC_URL="${KENDO_COMFY_PUBLIC_URL:-http://${PUBLIC_IPADDR}:${VAST_TCP_PORT_8188}}"
fi

nohup /opt/node/bin/node /opt/kendo-mcp/server.mjs \
  > "$workspace_dir/kendo-mcp.log" 2>&1 &
echo "[KENDO Vast V3] MCP started on port $mcp_port; log: $workspace_dir/kendo-mcp.log"

if [[ "${KENDO_AUTO_DOWNLOAD_MODELS:-1}" == "1" ]]; then
  if [[ "${KENDO_WAIT_FOR_MODELS:-0}" == "1" ]]; then
    /opt/kendo/download-models.sh > >(tee "$workspace_dir/kendo-model-download.log") 2>&1
  else
    nohup /opt/kendo/download-models.sh > "$workspace_dir/kendo-model-download.log" 2>&1 &
    echo "[KENDO Vast V3] Model downloader started; log: $workspace_dir/kendo-model-download.log"
  fi
fi

nohup python3.12 /opt/kendo/page_server_vast_v3.py \
  > "$workspace_dir/kendo-page.log" 2>&1 &
echo "[KENDO Vast V3] Page started on port $page_port"

if [[ ! -x "$venv_dir/bin/python" ]]; then
  echo "[KENDO Vast V3] Creating portable ComfyUI environment"
  python3.12 -m venv --system-site-packages "$venv_dir"
fi

mapfile -t comfy_args < <(sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e '/^$/d' "$args_file")
touch "$log_file"
cd "$comfyui_dir"
echo "[KENDO Vast V3] Starting ComfyUI on port $comfy_port"
exec "$venv_dir/bin/python" main.py \
  --listen 0.0.0.0 \
  --port "$comfy_port" \
  "${comfy_args[@]}" \
  > >(tee -a "$log_file") 2>&1
