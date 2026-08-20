#!/bin/bash
# ============================================================
#  KENDO AI  |  MiniMax H3 FULL Auto Setup (สำหรับคอร์ส)
#  image: runpod/comfyui:cuda13.0
#  ทำครบ: อัป ComfyUI -> nodes -> โมเดล -> SageAttention -> เปิด flag -> restart
#  วิธีใช้:  bash setup_kendo_h3_full.sh
# ============================================================
set -e

COMFY="/workspace/runpod-slim/ComfyUI"
ARGS="/workspace/runpod-slim/comfyui_args.txt"

if [ ! -d "$COMFY" ]; then
  echo "❌ ไม่เจอ ComfyUI ที่ $COMFY"
  echo "   หา path จริงด้วย: find /workspace -name custom_nodes -type d"
  exit 1
fi
CN="$COMFY/custom_nodes"
M="$COMFY/models"

# ---- หา python/pip ของ venv ที่ ComfyUI ใช้จริง (สำคัญมาก!) ----
VENV_PY=$(ls -d "$COMFY"/.venv*/bin/python 2>/dev/null | head -1)
if [ -z "$VENV_PY" ]; then
  VENV_PY="python3"          # เผื่อ image ไม่ได้ใช้ venv
fi
PIP="$VENV_PY -m pip"
echo "🐍 ใช้ Python ของ ComfyUI: $VENV_PY"
$VENV_PY -c "import torch;print('   torch',torch.__version__,'| CUDA',torch.version.cuda)" || true
echo ""

# ============================================================
echo "=== [1/5] อัปเดต ComfyUI ให้เป็นเวอร์ชันล่าสุด (H3 ต้อง >= 0.33) ==="
# ============================================================
cd "$COMFY"
BEFORE_VER=$(git describe --tags 2>/dev/null || echo "?")
UPDATED=0
if git fetch origin master 2>/dev/null; then
  # บังคับให้ตรงกับ master ล่าสุดเป๊ะ (แก้ปัญหา divergent/detached ของ image)
  if git reset --hard origin/master 2>/dev/null; then
    UPDATED=1
    echo "   ✅ อัป ComfyUI เป็น master ล่าสุดแล้ว"
  fi
fi

if [ "$UPDATED" = "1" ]; then
  # ลง requirements เฉพาะตอนอัปสำเร็จ — กัน pip ดาวน์เกรด package ตาม requirements เก่า
  $PIP install -r requirements.txt
else
  echo "   ⚠️ อัปไม่สำเร็จ — คงเวอร์ชันเดิมไว้ (ไม่รัน pip เพื่อกันดาวน์เกรด)"
  echo "   ถ้า H3 ยัง missing node ให้ใช้ ComfyUI-Manager > Update ComfyUI แทน"
fi
NOW_VER=$(git describe --tags 2>/dev/null || echo "?")
echo "   -> ComfyUI version: $BEFORE_VER -> $NOW_VER"

# ============================================================
echo ""
echo "=== [2/5] ลง Custom Nodes + requirements ==="
# ============================================================
cd "$CN"
clone_node () {
  name=$(basename "$1" .git)
  if [ -d "$name" ]; then echo "  ↳ $name มีแล้ว ข้าม clone"; else git clone "$1"; fi
  if [ -f "$CN/$name/requirements.txt" ]; then
    echo "  ↳ ลง requirements ของ $name"
    $PIP install -r "$CN/$name/requirements.txt" || echo "  ⚠️ requirements $name บางตัวลงไม่ครบ"
  fi
}
clone_node https://github.com/ltdrdata/ComfyUI-Manager.git
clone_node https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite.git
clone_node https://github.com/LeonQ8/ComfyUI-ALLinONE-MinimaxH3.git
clone_node https://github.com/kijai/ComfyUI-KJNodes.git

# ============================================================
echo ""
echo "=== [3/5] โหลดโมเดล 5 ไฟล์ (wget -c กันไฟล์แหว่ง) ==="
# ============================================================
mkdir -p "$M/diffusion_models" "$M/text_encoders" "$M/vae" "$M/loras"
get () { echo ""; echo "⬇️  $(basename "$2")"; wget -c "$1" -O "$2"; }

get "https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors?download=true" \
    "$M/diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors"
get "https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors?download=true" \
    "$M/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors"
get "https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_video_vae_fp16.safetensors?download=true" \
    "$M/vae/minimax_h3_video_vae_fp16.safetensors"
get "https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_audio_vae_fp32.safetensors?download=true" \
    "$M/vae/minimax_h3_audio_vae_fp32.safetensors"
get "https://huggingface.co/drbaph/MiniMax-H3-Turbo-Lora-ComfyUI/resolve/main/minimax_h3_turbo_v4_step600_ema_pruned_comfyui.safetensors?download=true" \
    "$M/loras/minimax_h3_turbo_v4_step600_ema_pruned_comfyui.safetensors"

# ============================================================
echo ""
echo "=== [4/5] ลง SageAttention (เลือก wheel ตาม Python + CUDA อัตโนมัติ) ==="
# ============================================================
# ตรวจ CUDA major (12/13) และ Python (cp310..cp314) ของ venv เอง แล้วเลือก wheel ให้ตรง
CU_MAJ=$($VENV_PY -c "import torch;print((torch.version.cuda or '13').split('.')[0])" 2>/dev/null || echo 13)
CP=$($VENV_PY -c "import sys;print(f'cp{sys.version_info.major}{sys.version_info.minor}')" 2>/dev/null || echo cp312)
WHL="https://github.com/snw35/sageattention-wheel/releases/download/cu12-2.2.0-cu13-2.2.0/sageattention-2.2.0%2Bcu${CU_MAJ}-${CP}-${CP}-linux_x86_64.whl"
echo "   ตรวจพบ: CUDA${CU_MAJ} / ${CP}"
if $VENV_PY -c "import sageattention" 2>/dev/null; then
  echo "   ↳ SageAttention มีแล้ว ข้าม"
else
  echo "   ↳ ลงจาก: $WHL"
  $PIP install "$WHL" || echo "⚠️ ลง Sage ไม่สำเร็จ — เช็ก Python/CUDA ให้ตรง wheel"
fi

# เปิด flag (เพิ่มถ้ายังไม่มี ไม่ให้ซ้ำ)
if [ -f "$ARGS" ] && grep -q "use-sage-attention" "$ARGS"; then
  echo "   ↳ flag --use-sage-attention มีในไฟล์ args แล้ว"
else
  echo "--use-sage-attention" >> "$ARGS"
  echo "   ↳ เพิ่ม --use-sage-attention เข้า $ARGS"
fi

# ============================================================
echo ""
echo "=== [5/5] สรุป + Restart ComfyUI ให้เข้าเวอร์ชัน/ตั้งค่าใหม่ ==="
# ============================================================
ls -lh "$M/diffusion_models" "$M/text_encoders" "$M/vae" "$M/loras"
echo ""
echo "🔄 กำลัง restart ComfyUI ให้โหลดของใหม่..."
pkill -f "main.py" 2>/dev/null && echo "   ↳ สั่ง restart แล้ว (ตัวจัดการ pod จะเปิด ComfyUI ใหม่เอง)" || \
  echo "   ↳ restart อัตโนมัติไม่ได้ — กด Restart ในหน้าเว็บ หรือ Restart pod เอง"
echo ""
echo "✅ เสร็จสมบูรณ์! รอ ComfyUI เปิดใหม่ ~1 นาที แล้วเข้าใช้ได้เลย"
echo "   เช็คว่า Sage ติด: grep -i 'sage' $COMFY/user/comfyui.log | tail -3"
