#!/usr/bin/env bash
set -Eeuo pipefail

COMFYUI_DIR="/workspace/runpod-slim/ComfyUI"
MODEL_ROOT="$COMFYUI_DIR/models"
LOCK_FILE="/workspace/.kendo-model-download.lock"
READY_FILE="/workspace/.kendo-h3-models-ready"
ERROR_FILE="/workspace/.kendo-h3-models-error"

on_error() {
  local exit_code="$?"
  printf '%s Download failed (exit %s). Check /workspace/kendo-model-download.log\n' \
    "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$exit_code" > "$ERROR_FILE"
  exit "$exit_code"
}
trap on_error ERR

mkdir -p \
  "$MODEL_ROOT/diffusion_models" \
  "$MODEL_ROOT/text_encoders" \
  "$MODEL_ROOT/vae" \
  "$MODEL_ROOT/loras"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "[KENDO] Another model downloader is already running; exiting"
  exit 0
fi

download_model() {
  local url="$1"
  local destination="$2"
  local expected_bytes="$3"
  local current_size=0

  if [[ -f "$destination" ]]; then
    current_size="$(stat -c '%s' "$destination" 2>/dev/null || echo 0)"
    if (( current_size >= expected_bytes )); then
      echo "[KENDO] Ready: $(basename "$destination") ($current_size bytes)"
      return 0
    fi

    local backup="${destination}.incomplete.$(date +%s)"
    mv "$destination" "$backup"
    echo "[KENDO] Preserved undersized file as: $backup"
  fi

  local partial="${destination}.part"
  echo "[KENDO] Downloading: $(basename "$destination")"
  aria2c \
    --allow-overwrite=true \
    --auto-file-renaming=false \
    --continue=true \
    --connect-timeout=30 \
    --console-log-level=warn \
    --download-result=hide \
    --file-allocation=none \
    --max-connection-per-server="${KENDO_CONNECTIONS_PER_FILE:-4}" \
    --max-tries=20 \
    --min-split-size=16M \
    --retry-wait=5 \
    --split="${KENDO_CONNECTIONS_PER_FILE:-4}" \
    --summary-interval=5 \
    --timeout=60 \
    --dir="$(dirname "$partial")" \
    --out="$(basename "$partial")" \
    "$url"

  current_size="$(stat -c '%s' "$partial" 2>/dev/null || echo 0)"
  if (( current_size < expected_bytes )); then
    echo "[KENDO] ERROR: Download is too small: $partial ($current_size bytes)" >&2
    return 1
  fi

  mv "$partial" "$destination"
  echo "[KENDO] Completed: $(basename "$destination") ($current_size bytes)"
}

wait_group() {
  local failed=0
  local pid
  for pid in "$@"; do
    if ! wait "$pid"; then
      failed=1
    fi
  done
  return "$failed"
}

rm -f "$READY_FILE" "$ERROR_FILE"

# Download the three largest independent files concurrently. aria2 also uses
# ranged connections per file, which avoids a single slow CDN stream becoming
# the bottleneck on fresh student Pods.
download_model \
  "https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors?download=true" \
  "$MODEL_ROOT/diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors" \
  20970379616 &
pid_diffusion="$!"

download_model \
  "https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors?download=true" \
  "$MODEL_ROOT/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors" \
  15687142551 &
pid_text_encoder="$!"

download_model \
  "https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_video_vae_fp16.safetensors?download=true" \
  "$MODEL_ROOT/vae/minimax_h3_video_vae_fp16.safetensors" \
  5207808496 &
pid_video_vae="$!"

if ! wait_group "$pid_diffusion" "$pid_text_encoder" "$pid_video_vae"; then
  echo "[KENDO] ERROR: One or more primary model downloads failed" >&2
  false
fi

# The two smaller files can finish together after the primary group.
download_model \
  "https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_audio_vae_fp32.safetensors?download=true" \
  "$MODEL_ROOT/vae/minimax_h3_audio_vae_fp32.safetensors" \
  605254808 &
pid_audio_vae="$!"

download_model \
  "https://huggingface.co/drbaph/MiniMax-H3-Turbo-Lora-ComfyUI/resolve/main/minimax_h3_turbo_v4_step600_ema_pruned_comfyui.safetensors?download=true" \
  "$MODEL_ROOT/loras/minimax_h3_turbo_v4_step600_ema_pruned_comfyui.safetensors" \
  620285592 &
pid_lora="$!"

if ! wait_group "$pid_audio_vae" "$pid_lora"; then
  echo "[KENDO] ERROR: One or more secondary model downloads failed" >&2
  false
fi

date -u +'%Y-%m-%dT%H:%M:%SZ' > "$READY_FILE"
rm -f "$ERROR_FILE"
echo "[KENDO] All MiniMax H3 models are ready"
