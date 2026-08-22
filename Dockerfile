FROM runpod/comfyui:1.4.4-cuda13.0

ARG COMFYUI_VERSION=v0.33.2
ARG VHS_COMMIT=4ee72c065db22c9d96c2427954dc69e7b908444b
ARG MINIMAX_AIO_COMMIT=354186321baf7a906b8a0e512e3f624335581fd0
ARG SAGEATTENTION_COMMIT=d1a57a546c3d395b1ffcbeecc66d81db76f3b4b5
ARG WORKFLOW_TEMPLATES_COMMIT=1121504798345b1bb4e6350991f90512c4ba1ed9

ENV DEBIAN_FRONTEND=noninteractive \
    CUDA_HOME=/usr/local/cuda \
    TORCH_CUDA_ARCH_LIST=12.0 \
    PIP_CONSTRAINT=/opt/comfyui-runtime-constraints.txt \
    KENDO_IMAGE_VERSION=1.1.4

USER root

# SageAttention for RTX 50-series / RTX PRO 6000 Blackwell (sm_120) needs the
# CUDA development headers below. The RunPod runtime image does not include all
# of them even though the matching runtime libraries are present.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libcublas-dev-13-0 \
      libcusolver-dev-13-0 \
      libcusparse-dev-13-0 \
      ninja-build \
    && rm -rf /var/lib/apt/lists/*

# Replace the baked ComfyUI core with the pinned H3-compatible release while
# keeping RunPod's baked nodes, Manager cache, and runtime conventions.
RUN set -eux; \
    git clone --depth 1 --branch "${COMFYUI_VERSION}" \
      https://github.com/Comfy-Org/ComfyUI.git /tmp/ComfyUI; \
    cp -a /opt/comfyui-baked/custom_nodes/. /tmp/ComfyUI/custom_nodes/; \
    if [ -d /opt/comfyui-baked/user ]; then \
      mkdir -p /tmp/ComfyUI/user; \
      cp -a /opt/comfyui-baked/user/. /tmp/ComfyUI/user/; \
    fi; \
    rm -rf /opt/comfyui-baked; \
    mv /tmp/ComfyUI /opt/comfyui-baked

RUN set -eux; \
    git clone https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite.git \
      /opt/comfyui-baked/custom_nodes/ComfyUI-VideoHelperSuite; \
    git -C /opt/comfyui-baked/custom_nodes/ComfyUI-VideoHelperSuite \
      checkout "${VHS_COMMIT}"; \
    git clone https://github.com/LeonQ8/ComfyUI-ALLinONE-MinimaxH3.git \
      /opt/comfyui-baked/custom_nodes/ComfyUI-ALLinONE-MinimaxH3; \
    git -C /opt/comfyui-baked/custom_nodes/ComfyUI-ALLinONE-MinimaxH3 \
      checkout "${MINIMAX_AIO_COMMIT}"

# Ship the official local H3 workflows that match the downloaded fl2va model.
RUN set -eux; \
    workflow_dir=/opt/comfyui-baked/user/default/workflows; \
    mkdir -p "$workflow_dir"; \
    curl -fSL \
      "https://raw.githubusercontent.com/Comfy-Org/workflow_templates/${WORKFLOW_TEMPLATES_COMMIT}/templates/video_minimax_h3_t2v.json" \
      -o "$workflow_dir/KENDO_MiniMax_H3_Text_to_Video.json"; \
    curl -fSL \
      "https://raw.githubusercontent.com/Comfy-Org/workflow_templates/${WORKFLOW_TEMPLATES_COMMIT}/templates/video_minimax_h3_i2v.json" \
      -o "$workflow_dir/KENDO_MiniMax_H3_Image_to_Video.json"

# Install core and custom-node dependencies into system site-packages. The
# RunPod-created ComfyUI venv uses --system-site-packages, so it sees these
# packages without reinstalling them on every Pod boot.
RUN set -eux; \
    python3.12 -m pip install --no-cache-dir \
      -r /opt/comfyui-baked/requirements.txt; \
    for req in \
      /opt/comfyui-baked/custom_nodes/ComfyUI-VideoHelperSuite/requirements.txt \
      /opt/comfyui-baked/custom_nodes/ComfyUI-ALLinONE-MinimaxH3/requirements.txt; do \
      if [ -f "$req" ]; then python3.12 -m pip install --no-cache-dir -r "$req"; fi; \
    done

# Build SageAttention 2.2.0 specifically for Blackwell sm_120. This produces a
# native sm_120a kernel usable by RTX 5090 and RTX PRO 6000 Blackwell.
RUN set -eux; \
    git clone https://github.com/thu-ml/SageAttention.git /tmp/SageAttention; \
    git -C /tmp/SageAttention checkout "${SAGEATTENTION_COMMIT}"; \
    cd /tmp/SageAttention; \
    EXT_PARALLEL=1 MAX_JOBS=1 python3.12 -m pip install \
      . --no-build-isolation --no-cache-dir; \
    cd /; \
    python3.12 -c "import sageattention; print('Baked SageAttention:', sageattention.__file__)"; \
    rm -rf /tmp/SageAttention

RUN printf '%s\n' \
      "KENDO_IMAGE_VERSION=1.1.4" \
      "COMFYUI_VERSION=${COMFYUI_VERSION}" \
      "VHS_COMMIT=${VHS_COMMIT}" \
      "MINIMAX_AIO_COMMIT=${MINIMAX_AIO_COMMIT}" \
      "SAGEATTENTION_COMMIT=${SAGEATTENTION_COMMIT}" \
      "WORKFLOW_TEMPLATES_COMMIT=${WORKFLOW_TEMPLATES_COMMIT}" \
      > /opt/comfyui-baked/.runpod-bundle-version

COPY scripts/download-models.sh /opt/kendo/download-models.sh
COPY scripts/entrypoint.sh /opt/kendo/entrypoint.sh
COPY scripts/page_server.py /opt/kendo/page_server.py
COPY web /opt/kendo-page
RUN chmod 0755 /opt/kendo/download-models.sh /opt/kendo/entrypoint.sh /opt/kendo/page_server.py

ENTRYPOINT ["/opt/kendo/entrypoint.sh"]
