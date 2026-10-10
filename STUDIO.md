# Kendo-Seedance 2.5+Qwen (V3.1)

Studio `v3.1.0-studio.2` pauses local Qwen image generation. The website now offers Seedance video only; old `/images.html` bookmarks redirect to `/seedance25.html`. Studio sets `KENDO_ENABLE_IMAGES=0`, hides the Qwen MCP tools and skips automatic Qwen model downloads. Existing ComfyUI, KIE tools, the MCP access URL and installed model files are retained. ComfyUI and KIE still share one MCP on port 3001. The RunPod template keeps its existing name and ID.

Current release published on 2026-10-10: [RunPod template](https://console.runpod.io/hub/template/9k0w23cmt8), image `ghcr.io/mamypoko2008/kendo-comfyui-h3:v3.1.0-studio.2`. [GitHub build](https://github.com/mamypoko2008/kendo-comfyui-h3/actions/runs/38059654529) succeeded. Public pull, amd64, entrypoint, source revision, disabled Qwen tools/download defaults, named services and unchanged storage were verified. Image digest: `sha256:b93b1f1614135f4c168450824106904b711bad0eb3dff2a122946a4bbb99f469`. The other 19 templates retained their names, image references, ports and service labels. No Pod was running or launched for this update; GPU inference remains unvalidated.

Previous image: `v3.1.0-studio.1`, [build](https://github.com/mamypoko2008/kendo-comfyui-h3/actions/runs/38056814904), digest `sha256:72778aa0a721a0eee826cc02b6ed9b4e032b70a143bc39be78e481db915d288f`. The template remains public, with 100 GB container disk and 100 GB persistent volume.

The video page uses the V3 light/dark design:

- `/seedance25.html`: Seedance 2.5 or **regular** Seedance 2.0 via KIE. Review and confirm the price before submitting. The selector changes price, duration and reference limits. Images/text only; video-input billing is not included in these estimates.
- `/images.html`: redirects to the video page. Local Qwen creation is paused.

## Archived Qwen 2.1 + Flux Klein workflow

The Qwen setup below documents the previous image experiment; it is disabled in the current Studio release.

The page and `kendo_image_generate(model="qwen21-klein")` share the same graph builder. This profile uses Qwen BF16, the FP8 Qwen3-VL encoder, Detail Daemon, 30 Euler/simple steps at CFG 1, sharpen, scaling to approximately 4 MP, Flux Klein 9B with reference latents and 2 Euler steps, color match at strength 0.8, then sharpen. PNGs before and after Flux Klein are saved separately and appear with labeled buttons in history. The same explicit seed is used in both stages for repeatability; the attachment had a separate randomized Flux seed.

This profile is **text-to-image / RGB**. Reference editing and transparency remain available in the two native Qwen modes. Switching with attached images retains them and blocks this text-only profile until they are removed or the model is switched back. Output is about 4 megapixels, not necessarily a 4096-pixel edge. Flux refines/reconstructs content; the prompt asks it to preserve the image but exact identity is not guaranteed. Its image quality has not been verified on a GPU in this task.

The original active portrait LoRA is optional and **off by default** because only the workflow JSON was attached. Enable "ใช้ LoRA จาก workflow" after placing `RLY-thot_shot-QWEN21-helena-v1a-trigger-rlyhelena.safetensors` in `models/loras`. Its original strength is 1 and trigger is `rlyhelena`; the page uses the user's prompt, without inserting the attachment's portrait prompt. The two bypassed LoRAs (`nicegirls_qwen12` and the Viggle Turbo LoRA) and disconnected advanced sampler are excluded from generation.

For this additional profile, place these six files under the persistent ComfyUI `models` directory. They are **not** part of the default 17.28 GB Turbo download:

| Folder | Filename | Official source |
| --- | --- | --- |
| `diffusion_models` | `qwen_image_2.1_bf16.safetensors` | [Comfy-Org Qwen 2.1, pinned revision](https://huggingface.co/Comfy-Org/Qwen-Image-2.1/tree/df94239739eef7205973a145ffa6f441f7b64e84/diffusion_models) |
| `text_encoders` | `qwen3vl_8b_fp8_scaled.safetensors` | [Comfy-Org Qwen3-VL, pinned revision](https://huggingface.co/Comfy-Org/Qwen3-VL/tree/02f0d3eefb59528799653d16735818801177ef1f/text_encoders) |
| `vae` | `qwen_image_2.1_vae_bf16.safetensors` | [Comfy-Org Qwen 2.1 VAE](https://huggingface.co/Comfy-Org/Qwen-Image-2.1/tree/df94239739eef7205973a145ffa6f441f7b64e84/vae); shared with the existing native profile |
| `diffusion_models` | `flux-2-klein-9b-fp8.safetensors` | [Black Forest Labs, pinned revision](https://huggingface.co/black-forest-labs/FLUX.2-klein-9b-fp8/tree/902d9d510b51533e07729f19211414a3648b77d2); access must be granted in the user's Hugging Face account before downloading |
| `text_encoders` | `qwen_3_8b.safetensors` | [Comfy-Org Flux Klein, pinned revision](https://huggingface.co/Comfy-Org/flux2-klein-9B/tree/3f62d9d8ae1fec33c6e91453d5c712855b096b55/split_files/text_encoders) |
| `vae` | `flux2-vae.safetensors` | [Comfy-Org Flux Klein VAE](https://huggingface.co/Comfy-Org/flux2-klein-9B/tree/3f62d9d8ae1fec33c6e91453d5c712855b096b55/split_files/vae) |

The new Docker image installs [Detail Daemon](https://github.com/Jonseed/ComfyUI-Detail-Daemon) at `3394e44afea04ed0188fb37b21f0d9952469766b` and [KJNodes](https://github.com/kijai/ComfyUI-KJNodes) at `d3cfe21625e5170126ce06fbfcfe1d88108688c3`, including requirements. KJNodes provides the compatible `ColorMatch` implementation in place of the attachment's RunningHub wrapper. A reused Pod installation must also have those plugins. The page/MCP list every missing node and filename before allowing a submission.

`workflows/qwen21_flux_klein_source.json` preserves the attached editable topology with cached temporary preview links removed; the original Downloads attachment is unchanged. This reference file still contains rgthree comparison/seed widgets and Comfyroll text widgets, which require those plugins if opened directly in the ComfyUI canvas. The website/MCP builder eliminates those UI-only dependencies and replaces temporary previews with permanent SaveImage nodes. It does not load this JSON as an API prompt.

## Build a new Studio image

```sh
docker build -f Dockerfile.v3-beta -t kendo-comfyui-h3:studio-base .
docker build -f Dockerfile.studio -t kendo-comfyui-h3:studio .
```

The inherited entrypoint reuses an existing ComfyUI installation on persistent volumes; it does not upgrade it automatically. Qwen creation is paused in studio.2, so no Qwen node/model setup is needed for the video page.

The `Build Kendo-Seedance 2.5+Qwen` GitHub workflow builds and publishes `v3.1.0-studio.2` when manually dispatched, or a `v3.1.*-studio.*` tag when pushed. For the studio.2 release, `reuse_studio_runtime=true` uses `Dockerfile.studio-update` to retain the published studio.1 runtime and replace only the page, MCP server and entrypoint. `runpod-studio.json` describes the existing RunPod template named **Kendo-Seedance 2.5+Qwen**; release results are recorded in `runpod-studio-deployed.json` after verification.

The published template's Connect service names are **Page HTML** (3000), **Comfy MCP** (3001), **ComfyUI** (8188), **JupyterLab** (8888), and **SSH** (22). These are RunPod template `portsConfig` values, separate from the exposed `ports` list. REST v1 does not accept `portsConfig`; apply the names through the template editor or GraphQL `saveTemplate` when recreating this template. The HTTP labels were verified on the running `ok4dx1nsvkpvlm` Pod without restarting it.

The Studio image retains ComfyUI `0df64eb242b7c5759c3e86afd5d1846d923b1033`. Studio.2 disables automatic Qwen model downloads with `KENDO_ENABLE_IMAGES=0` and an empty `KENDO_IMAGE_MODELS`. Previously downloaded files remain on the volume. No new public port is required: pages and `/api/kie` stay on 3000; MCP stays on 3001. Studio's internal service listens on loopback 8766.

The Studio landing page is the Seedance page. H3 model downloads are off by default for this image; set `KENDO_AUTO_DOWNLOAD_MODELS=1` to retain local H3 generation as well.

For reference, the previous experiment downloaded its native Qwen models with:

```sh
python3.12 /opt/kendo/download_image_models.py --models qwen21-turbo,qwen21
```

No model download has been performed on the development computer. Docker building and publication succeeded in GitHub Actions. GPU inference still needs to be verified on the target Pod.

## KIE setup

Set `KIE_API_KEY` in the Pod environment. It stays server-side. Use the Pod's `KENDO_MCP_CODE` to connect the video page; this is the same access code as the existing MCP URL. The page never asks for the provider API key. KIE tasks/results are stored in `/workspace/kendo-kie` and shared with `kie_seedance_generate`, `kie_job_status` and `kie_history`. The previous Seedream MCP tool remains available.

ComfyUI and KIE tools share `https://POD_ID-3001.proxy.runpod.net/mcp/ACCESS_CODE`. Studio.2 does not register `kendo_image_status`, `kendo_image_generate`, or `kendo_image_job_status`. The existing ComfyUI video/status/reference tools and KIE tools remain available on this same link.

At 720p, text/image input: regular Seedance 2.0 **$0.205/s**, 2.5 **$0.315/s**. THB uses an editable conversion rate, initially 33.53; this is an estimate, not a live currency feed. Rates checked on 2026-10-10. These prices exclude Pod rental and payment fees. Failed/uncertain paid submissions are not automatically recreated.

Local preview with a ComfyUI instance on localhost:8188:

```sh
node mcp/studio-server.mjs
```

Open `http://127.0.0.1:8766/seedance25.html`. `/images.html` redirects there. Without KIE configuration, the video page supports layout and review previews while generation remains unavailable.

## Qwen and Krea 2 compatibility

Generic native nodes such as UNETLoader, CLIPLoader, VAELoader, KSampler and VAEDecode can be reused. The **Qwen 2.1** workflow uses `TextEncodeQwenImage21`, an 8B encoder and `qwen_image_2.1_vae_bf16.safetensors`. Krea 2's documented workflow uses a 4B encoder and the older `qwen_image_vae.safetensors`. They are not interchangeable by replacing only the diffusion file. Krea's Partner API node also calls Krea's service rather than running Qwen on a local GPU.

Sources:

- [Qwen Image 2.1 native models and workflows](https://huggingface.co/Comfy-Org/Qwen-Image-2.1)
- [Official Qwen model](https://huggingface.co/Qwen/Qwen-Image-2.1)
- [Official workflow](https://github.com/Comfy-Org/workflow_templates/blob/main/templates/image_qwen_image_2_1_t2i.json), retrieved at workflow revision `8be1f8c4b5af2d550d70922a23b79cee599e1f3e`
- [Krea 2 native ComfyUI workflow](https://docs.comfy.org/tutorials/image/krea/krea-2)
- [Seedance 2.0 / Fast](https://kie.ai/seedance-2-0) and [Seedance 2.5](https://kie.ai/seedance-2-5)
