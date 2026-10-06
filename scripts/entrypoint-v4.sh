#!/usr/bin/env bash
set -Eeuo pipefail
comfy_dir=/workspace/runpod-slim/ComfyUI
if [[ -d "$comfy_dir" ]]; then
  if ! cmp -s /opt/comfyui-baked/.kendo-v4-core "$comfy_dir/.kendo-v4-core"; then
    echo '[V4] This volume contains a different ComfyUI version. Use a separate V4 volume; no existing V3 files were changed.' >&2
    exit 24
  fi
else
  mkdir -p "$(dirname "$comfy_dir")"
  cp -a /opt/comfyui-baked "$comfy_dir"
fi
args_file=/workspace/runpod-slim/comfyui_args.txt
touch "$args_file"
if ! grep -q -- '--max-upload-size' "$args_file"; then
  echo '--max-upload-size 512' >> "$args_file"
fi
code_file="${KENDO_MCP_CODE_FILE:-/workspace/.kendo-mcp-code}"
if [[ -z "${KENDO_MCP_CODE:-}" ]]; then
  if [[ ! -s "$code_file" ]]; then
    python3.12 -c 'import secrets; print("kendo-" + secrets.token_hex(8))' > "$code_file"
  fi
  export KENDO_MCP_CODE="$(tr -d '[:space:]' < "$code_file")"
fi
nohup /opt/node/bin/node /opt/kendo-mcp/server.mjs > /workspace/kendo-mcp.log 2>&1 &
touch "${KENDO_COMFY_LOG_FILE:-/workspace/comfyui.log}"
exec /opt/kendo/entrypoint.sh > >(tee -a "${KENDO_COMFY_LOG_FILE:-/workspace/comfyui.log}") 2>&1
