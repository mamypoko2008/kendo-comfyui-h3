#!/usr/bin/env bash
set -Eeuo pipefail

COMFYUI_DIR="/workspace/runpod-slim/ComfyUI"
MODEL_ROOT="$COMFYUI_DIR/models"
LOCK_FILE="/workspace/.kendo-model-download.lock"
READY_FILE="/workspace/.kendo-h3-models-ready"

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
  local minimum_bytes="$3"
  local current_size=0

  if [[ -f "$destination" ]]; then
    current_size="$(stat -c '%s' "$destination" 2>/dev/null || echo 0)"
    if (( current_size >= minimum_bytes )); then
      echo "[KENDO] Ready: $(basename "$destination") ($current_size bytes)"
      return 0
    fi

    local backup="${destination}.incomplete.$(date +%s)"
    mv "$destination" "$backup"
    echo "[KENDO] Preserved undersized file as: $backup"
  fi

  local partial="${destination}.part"
  echo "[KENDO] Downloading: $(basename "$destination")"
  wget -c --progress=dot:giga "$url" -O "$partial"

  current_size="$(stat -c '%s' "$partial" 2>/dev/null || echo 0)"
  if (( current_size < minimum_bytes )); then
    echo "[KENDO] ERROR: Download is too small: $partial ($current_size bytes)" >&2
    return 1
  fi

  mv "$partial" "$destination"
  echo "[KENDO] Completed: $(basename "$destination") ($current_size bytes)"
}

rm -f "$READY_FILE"

download_model \
  "https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors?download=true" \
  "$MODEL_ROOT/diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors" \
  19000000000

download_model \
  "https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors?download=true" \
  "$MODEL_ROOT/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors" \
  14000000000

download_model \
  "https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_video_vae_fp16.safetensors?download=true" \
  "$MODEL_ROOT/vae/minimax_h3_video_vae_fp16.safetensors" \
  4000000000

download_model \
  "https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_audio_vae_fp32.safetensors?download=true" \
  "$MODEL_ROOT/vae/minimax_h3_audio_vae_fp32.safetensors" \
  500000000

download_model \
  "https://huggingface.co/drbaph/MiniMax-H3-Turbo-Lora-ComfyUI/resolve/main/minimax_h3_turbo_v4_step600_ema_pruned_comfyui.safetensors?download=true" \
  "$MODEL_ROOT/loras/minimax_h3_turbo_v4_step600_ema_pruned_comfyui.safetensors" \
  500000000

date -u +'%Y-%m-%dT%H:%M:%SZ' > "$READY_FILE"
echo "[KENDO] All MiniMax H3 models are ready"
