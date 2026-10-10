// Native Qwen generation through the same ComfyUI used by /images.html.
import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));

export function registerImageTools(server, options = {}) {
  const native = require(options.workflowFile ?? process.env.KENDO_IMAGE_WORKFLOW_FILE ?? path.resolve(here, '../web/workflow-images.js'));
  const origin = options.comfyBase ?? `http://${process.env.KENDO_COMFY_HOST ?? '127.0.0.1'}:${process.env.KENDO_COMFY_PORT ?? 8188}`;
  const inputDir = options.inputDir ?? process.env.KENDO_INPUT_DIR ?? '/workspace/runpod-slim/ComfyUI/input';
  const pageUrl = options.pageUrl ?? process.env.KENDO_PUBLIC_PAGE_URL ?? (process.env.RUNPOD_POD_ID ? `https://${process.env.RUNPOD_POD_ID}-${process.env.KENDO_PAGE_PORT ?? 3000}.proxy.runpod.net` : `http://127.0.0.1:${process.env.KENDO_PAGE_PORT ?? 3000}`);
  async function comfy(route, init = {}) {
    const response = await fetch(origin + route, { ...init, signal: AbortSignal.timeout(60000) });
    let data;
    try { data = await response.json(); } catch { throw new Error('ComfyUI returned an invalid response'); }
    if (!response.ok) throw new Error('ComfyUI rejected the request. Check the Pod Console; do not automatically resubmit generation.');
    return data;
  }
  const guard = handler => async args => {
    try { const data = await handler(args ?? {}); return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data }; }
    catch (error) { return { content: [{ type: 'text', text: error.message }], isError: true }; }
  };
  server.registerTool('kendo_image_status', {
    title: 'Local Qwen readiness', description: 'Check native Qwen Image 2.1 nodes and model files in ComfyUI. No GPU generation, no KIE credits.'
  }, guard(async () => {
    const info = await comfy('/object_info');
    return { models: Object.fromEntries(Object.keys(native.MODELS).map(id => [id, native.readiness(info, id)])), page_url: pageUrl + '/images.html' };
  }));
  server.registerTool('kendo_image_generate', {
    title: 'Create or edit an image with local Qwen Image 2.1',
    description: 'Uses RunPod GPU through ComfyUI; no KIE credits. Check kendo_image_status first. Native Qwen supports up to 10 references already uploaded to the Pod input directory; editing follows the first image aspect ratio. qwen21-klein adapts the attached Qwen BF16 + Detail Daemon + Flux Klein 9B workflow: text-only, RGB, approximately 4MP output, saves before/after PNGs, optional portrait LoRA. Returns prompt_id; poll kendo_image_job_status. Never automatically retry generation after an uncertain connection failure.',
    inputSchema: {
      model: z.enum(['qwen21-turbo', 'qwen21', 'qwen21-klein']).default('qwen21-turbo'),
      prompt: z.string().min(1).max(5000),
      references: z.array(z.string()).max(10).default([]),
      ratio: z.enum(['1:1', '4:3', '3:4', '3:2', '2:3', '16:9', '9:16']).default('1:1'),
      resolution: z.union([z.literal(1024), z.literal(2048)]).default(1024),
      steps: z.number().int().min(1).max(80).optional(),
      seed: z.number().int().min(0).max(4294967295).default(42),
      transparent: z.boolean().default(false),
      use_attached_lora: z.boolean().default(false).describe('For qwen21-klein only: enable the original portrait LoRA; requires its weights in models/loras')
    }
  }, guard(async args => {
    const info = await comfy('/object_info');
    if (native.MODELS[args.model].textOnly && (args.references.length || args.transparent)) throw new Error('qwen21-klein is text-to-image with RGB output; choose native Qwen for reference editing or transparency');
    const ready = native.readiness(info, args.model, args);
    if (!ready.ready) throw new Error(`Qwen is not ready. Missing nodes: ${ready.missingNodes.join(', ')}; missing files: ${ready.missingFileNames.join(', ')}`);
    for (const name of args.references) {
      if (!name || name.includes('..') || path.isAbsolute(name) || !/\.(png|jpe?g|webp)$/i.test(name)) throw new Error('Use a reference filename inside the ComfyUI input directory');
      const target = path.resolve(inputDir, name);
      if (!target.startsWith(path.resolve(inputDir) + path.sep)) throw new Error('Invalid reference filename');
      const stat = await fs.stat(target).catch(() => null);
      if (!stat?.isFile()) throw new Error('Reference image is not in the ComfyUI input directory: ' + name);
    }
    const prompt = native.buildWorkflow({ ...args, ...ready.files });
    const task = await comfy('/prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, client_id: 'kendo-images-mcp' }) });
    if (!task.prompt_id) throw new Error('ComfyUI did not return a prompt ID; check the queue before resubmitting');
    return { prompt_id: task.prompt_id, model: args.model, status: 'queued', page_url: pageUrl + '/images.html' };
  }));
  server.registerTool('kendo_image_job_status', {
    title: 'Local Qwen image result', description: 'Read the ComfyUI history for a local image task and return view/download URLs.',
    inputSchema: { prompt_id: z.string().regex(/^[\w-]{1,180}$/) }
  }, guard(async ({ prompt_id }) => {
    const result = (await comfy('/history/' + encodeURIComponent(prompt_id)))[prompt_id];
    if (!result) return { prompt_id, status: 'waiting' };
    const images = Object.values(result.outputs ?? {}).flatMap(output => output.images ?? []);
    const urls = images.map(image => pageUrl + '/api/comfy/view?' + new URLSearchParams({ filename: image.filename, subfolder: image.subfolder ?? '', type: image.type ?? 'output' }));
    return { prompt_id, status: result.status?.status_str === 'error' ? 'error' : result.status?.completed ? 'done' : 'running', images, image_urls: urls };
  }));
}
