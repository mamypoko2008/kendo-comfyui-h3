# Kendo-ComfyUI-H3 Fast v3 beta

Separate beta release. Existing v1 and v2 images and RunPod templates remain unchanged.

## beta.12 — v2 clone + Claude MCP

beta.12 restarts the v3 line from the stable v2.1.2 stack. Everything that was
specific to beta.5–beta.11 (Realism People LoRA, native-attention graph,
upscalers, KJNodes) is gone; recover it from git history (`0993ccb`) if needed.

### Generation stack (identical to v2.1.2)

- Image: `ghcr.io/mamypoko2008/kendo-comfyui-h3:v3.0.0-beta.12`
- Base: tested v1.1.5 CUDA 13 / ComfyUI / SageAttention stack, `KENDO_ENABLE_SAGE=1`
- H3: Ref2VA INT8 graph with the full Ref2VA Turbo LoRA, 10 steps default
- References: 9 images, 1 video (off by default), 3 audio clips; seed Auto/Lock
- Same Crimson UI, resizable controls, large thumbnails, prompt-free history
- Clips are saved as `video/Kendo_H3_v3_*` so v2 and v3 outputs stay distinguishable
- Readiness markers: `/workspace/.kendo-h3-v3-models-ready` / `-error`
- Container disk: **100 GB** (same as v2); persistent volume 100 GB at `/workspace`

### New: Claude MCP server (port 3001)

An MCP server (`mcp/server.mjs`, Node 22 pinned in the image) runs inside the
Pod and exposes the Page's generation pipeline to Claude Desktop and Claude
Code over Streamable HTTP:

```
https://POD_ID-3001.proxy.runpod.net/mcp/<access code>
```

- The access code is `KENDO_MCP_CODE` from the template env, otherwise one is
  generated on first boot and kept in `/workspace/.kendo-mcp-code` so the URL
  survives restarts on the same volume. It is a self-made secret, not a paid token.
- A wrong code answers **404** (never 401) so Claude does not try OAuth.
- Stateless JSON responses; no SSE streams through the RunPod proxy.
- The Page shows a **"เชื่อมต่อ Claude"** card with the URL, a copy button, and
  the Claude Desktop / Claude Code steps (`/api/kendo/status` now returns
  `mcp_url` and `mcp_ready`).
- Tools: `kendo_status`, `kendo_list_references`, `kendo_upload_from_url`,
  `kendo_generate`, `kendo_job_status`, `kendo_history`, `kendo_cancel`.
- `kendo_upload_from_url` pulls public image/video/audio URLs (for example
  results from an image generator) straight into ComfyUI's input folder;
  private/loopback hosts are refused. Chat attachments cannot reach the Pod.
- `kendo_generate` reuses `web/workflow-v3-beta.js`, so Claude and the Page
  build the exact same graph. It returns a job id immediately; Claude polls
  `kendo_job_status`, which returns a public `video_url` through port 3000.
- Clips submitted by Claude are merged into the Page's history (seed only, no
  prompt) by polling ComfyUI history every 20 s.
- Page uploads now keep a readable name (`hero-front-3f9a1c.png`) so Claude can
  tell references apart in `kendo_list_references`.

### Template changes

- `runpod-v3-beta.json`: container disk 100 GB, `KENDO_ENABLE_SAGE=1`, new
  port `3001/http`, readme lists the Claude MCP service.
- Port labels to set in RunPod: 3000 `Page`, 3001 `Claude MCP`, 8188 `Comfy`,
  8888 `JupyterLab`.

### Tests

- `node --test tests/workflow.test.cjs tests/workflow-v3-beta.test.cjs tests/mcp-v3-beta.test.mjs`
  (the MCP suite drives the server with the official MCP client against a mock ComfyUI)
- `python -m unittest discover -s tests -v` (`tests/test_v3_beta.py` covers the
  readiness endpoint and the `mcp_url` derivation)
- `node tests/ui-v3-beta.cjs` (Playwright: Claude card, history merge, readable
  upload names, plus every v2 assertion)
- `npm ci` inside `mcp/` is required before the Node tests.

GPU generation, the RunPod proxy path to port 3001, and the Claude Desktop
custom-connector flow still require live verification on a real Pod before
this beta is promoted.

## Earlier betas (beta.5 – beta.11)

Superseded and removed from the tree in beta.12. Summary for reference:
beta.5 SeedVR2/Real-ESRGAN upscale workspace; beta.7–beta.8 NVIDIA RTX VSR;
beta.9 RTX VSR removed after `NvVFX_Load` error `-12`; beta.10 upscalers removed,
KJNodes SageAttention patch + fal Realism People LoRA; beta.11 native attention.
Last published template image before beta.12: `v3.0.0-beta.11` (template `ok09ni9573`).
