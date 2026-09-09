# Kendo-ComfyUI-H3 Fast v2

Separate release: keep existing RunPod templates and v1 image tags unchanged.

- Image: ghcr.io/mamypoko2008/kendo-comfyui-h3:v2.0.0
- CUDA: 13.0 only; driver >=580.65.06
- Container disk: 30 GB; persistent volume: 100 GB at /workspace
- Ports: 3000/http, 8188/http, 8888/http, 22/tcp
- KENDO_ENABLE_SAGE=1, KENDO_AUTO_DOWNLOAD_MODELS=1, KENDO_WAIT_FOR_MODELS=0
- Crimson/white UI with persistent dark toggle; no left icon rail or idea presets.
- References: 9 images, 1 video, 3 standalone audio clips. Optional video soundtrack.
- Ref2VA INT8 diffusion model; existing text encoder and VAEs reused by exact size.
- No FL2VA or Turbo LoRA downloads on fresh v2 volumes.
- Three parallel aria2 jobs; resumable .part files; v2 readiness verifies all files.
- Media uploads max 512 MB each in UI. Video uses first output-duration seconds at 24 fps.
- Reference prompt tags are generated in model order, including video soundtracks.

Build with Dockerfile.v2. Publish a v2.0.0 tag only after tests pass. Use a new
template; do not edit g6zjcd5aew or mcji280319. Create a fresh Pod for v2.

GPU generation and live RunPod deployment require separate verification. Local
unit tests do not establish GPU capacity at maximum reference counts.
