#!/usr/bin/env bash
set -Eeuo pipefail
args_file=/workspace/runpod-slim/comfyui_args.txt
mkdir -p "$(dirname "$args_file")"
touch "$args_file"
if ! grep -q -- '--max-upload-size' "$args_file"; then
  echo '--max-upload-size 512' >> "$args_file"
fi

# Detect the assigned GPU and enable the baked sm_120 Sage kernel only when it
# imports successfully on a compatible Blackwell card.
if python3.12 /opt/kendo/detect_runpod_runtime.py; then
  export KENDO_ENABLE_SAGE=1
else
  # The inherited entrypoint also reads this variable. Keep it from adding the
  # Sage flag back after this probe deliberately selected Native fallback.
  export KENDO_ENABLE_SAGE=0
fi

# Claude connection code: honour the template env, otherwise keep one per
# workspace so the URL students pasted survives Pod restarts on the same volume.
code_file="${KENDO_MCP_CODE_FILE:-/workspace/.kendo-mcp-code}"
export KENDO_MCP_HOST="${KENDO_MCP_HOST:-0.0.0.0}"
if [[ -z "${KENDO_MCP_CODE:-}" ]]; then
  if [[ ! -s "$code_file" ]]; then
    python3.12 -c 'import secrets; print("kendo-" + secrets.token_hex(8))' > "$code_file"
  fi
  export KENDO_MCP_CODE="$(tr -d '[:space:]' < "$code_file")"
fi

nohup /opt/node/bin/node /opt/kendo-mcp/server.mjs \
  > /workspace/kendo-mcp.log 2>&1 &
echo "[KENDO v3 beta] Claude MCP server listening on ${KENDO_MCP_HOST}:${KENDO_MCP_PORT:-3001}; log: /workspace/kendo-mcp.log"

touch "${KENDO_COMFY_LOG_FILE:-/workspace/comfyui.log}"
exec /opt/kendo/entrypoint.sh > >(tee -a "${KENDO_COMFY_LOG_FILE:-/workspace/comfyui.log}") 2>&1
