#!/usr/bin/env bash
set -Eeuo pipefail
args_file=/workspace/runpod-slim/comfyui_args.txt
mkdir -p "$(dirname "$args_file")"
touch "$args_file"
if ! grep -q -- '--max-upload-size' "$args_file"; then
  echo '--max-upload-size 512' >> "$args_file"
fi

# Claude connection code: honour the template env, otherwise keep one per
# workspace so the URL students pasted survives Pod restarts on the same volume.
code_file="${KENDO_MCP_CODE_FILE:-/workspace/.kendo-mcp-code}"
if [[ -z "${KENDO_MCP_CODE:-}" ]]; then
  if [[ ! -s "$code_file" ]]; then
    python3.12 -c 'import secrets; print("kendo-" + secrets.token_hex(8))' > "$code_file"
  fi
  export KENDO_MCP_CODE="$(tr -d '[:space:]' < "$code_file")"
fi

nohup /opt/node/bin/node /opt/kendo-mcp/server.mjs \
  > /workspace/kendo-mcp.log 2>&1 &
echo "[KENDO v3 beta] Claude MCP server started on port ${KENDO_MCP_PORT:-3001}; log: /workspace/kendo-mcp.log"

exec /opt/kendo/entrypoint.sh
