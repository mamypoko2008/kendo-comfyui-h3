# Kendo-ComfyUI-H3 Fast v2

Separate release: keep existing RunPod templates and v1 image tags unchanged.

- Image: ghcr.io/mamypoko2008/kendo-comfyui-h3:v2.1.0
- CUDA: 13.0 only; driver >=580.65.06
- Container disk: 30 GB; persistent volume: 100 GB at /workspace
- Ports: 3000/http, 8188/http, 8888/http, 22/tcp, 22/udp
- KENDO_ENABLE_SAGE=1, KENDO_AUTO_DOWNLOAD_MODELS=1, KENDO_WAIT_FOR_MODELS=0
- Crimson/white UI with persistent dark toggle; no left icon rail or idea presets.
- References: 9 images, 1 video, 3 standalone audio clips. Optional video soundtrack.
- Ref2VA INT8 diffusion model; existing text encoder and VAEs reused by exact size.
- Full Ref2VA Turbo LoRA (BF16, 1,956,193,000 bytes); no FL2VA LoRA is used.
- Steps default to 10 and remain adjustable; the source Turbo LoRA was distilled for 4 steps.
- Duration slider supports 5–20 seconds; output presets include 1.2, 1.5, and 2 MP.
- The controls panel scales with the viewport and can be resized horizontally on desktop.
- Three parallel aria2 jobs; resumable .part files; v2 readiness verifies all files.
- Media uploads max 512 MB each in UI. Video uses first output-duration seconds at 24 fps.
- Reference prompt tags are generated in model order, including video soundtracks.

The initial v2.0.0 build completed successfully from commit `ba3488e`. The v2.1.0
release adds the matching Ref2VA Turbo LoRA and the updated controls.

- RunPod template: `Kendo-ComfyUI-H3 Fast v2`
- Template ID: `1ncfofsbzx`
- Visibility: Public
- Existing templates `g6zjcd5aew` and `mcji280319` remain unchanged.

Create a fresh Pod from the v2 template for live GPU verification.

GPU generation and live RunPod deployment require separate verification. Local
unit tests do not establish GPU capacity at maximum reference counts.
