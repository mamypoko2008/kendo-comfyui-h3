# Kendo MiniMax H3 V3 beta.16 for Vast.ai

This is a separate Vast.ai package of the immutable RunPod V3 beta.16 image.
It preserves the V3 Page, MiniMax H3 workflow, MCP server, seed controls,
prompt-free history, GPU detection, and verified SageAttention status while
removing the runtime dependency on RunPod's `/start.sh`.

The Page model dropdown provides the original MiniMax H3 INT8 checkpoint and
Singularity V2 pruned INT8 (20 GB). Original remains the default.

## Image

`ghcr.io/mamypoko2008/kendo-comfyui-h3:vast-v3.0.0-beta.16-1`

## Published template

Updated on 26 October 2026 as the existing private V3 template:

- Template ID: `771638`
- Template hash: `c0a1c870d859da55d5936322f0ac2ffe`
- Source build: [GitHub Actions run 40276224290](https://github.com/mamypoko2008/kendo-comfyui-h3/actions/runs/40276224290)
- Image digest: `sha256:b107972f3ea7479cc15453f1432609682f5bbc1cee92307d5e43919cd5b37e7a`

No instance was created or rented during publication. Other Vast.ai templates
were verified unchanged.

## Vast.ai template settings

- Launch mode: **Docker Entrypoint** (`runtype: args`)
- Recommended disk: **100 GB**
- Ports: `3000/tcp` Page, `3001/tcp` MCP, `8188/tcp` ComfyUI
- Docker options:

  `-p 3000:3000 -p 3001:3001 -p 8188:8188 -e KENDO_AUTO_DOWNLOAD_MODELS=1 -e KENDO_WAIT_FOR_MODELS=0 -e KENDO_ENABLE_SAGE=auto`

Do not select Vast's SSH or Jupyter launch mode: those modes replace the image
entrypoint. Vast randomly assigns external ports and exposes them through
`VAST_TCP_PORT_3000`, `VAST_TCP_PORT_3001`, and `VAST_TCP_PORT_8188`; the Page
uses those values to show the correct public addresses.

## GPU and SageAttention

At every start the image detects GPU name, VRAM, driver, and CUDA compute
capability. The baked SageAttention kernel is enabled only when its import
succeeds on a compatible `sm_120` Blackwell GPU such as RTX 5090 or RTX PRO
6000. Other GPUs fall back to Native attention instead of crashing ComfyUI.

Use a host with an NVIDIA driver compatible with the image's CUDA 13 runtime
and at least 32 GB VRAM. Generation memory depends on duration, resolution, and
reference count.

## First launch and logs

The first launch downloads roughly 65 GB of models into the persistent
`/workspace/runpod-slim/ComfyUI/models` path. Downloads resume after an
interruption. Logs are stored at:

- `/workspace/kendo-model-download.log`
- `/workspace/kendo-page.log`
- `/workspace/kendo-mcp.log`
- `/workspace/comfyui.log`

## MCP note

Vast's direct mapped port normally produces an HTTP address. Claude custom
connectors require a public HTTPS endpoint, so use a trusted HTTPS tunnel and
set `KENDO_MCP_PUBLIC_URL=https://your-host/mcp/{code}` when remote Claude MCP
access is needed. The randomly generated MCP access code persists at
`/workspace/.kendo-mcp-code`.

## Security

Mapped ports are publicly reachable. The MCP path is protected by its random
access code, but the Page and direct ComfyUI port do not add authentication.
Omit port 8188 if direct ComfyUI access is not needed, and add a firewall,
authenticated proxy, or SSH tunnel for long-running use.
