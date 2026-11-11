(function(root) {
  'use strict';

  const MODELS = {
    h3image: {
      name: 'MiniMax H3 Image · INT8',
      diffusion: 'minimax_h3_image_pruned_int8_convrot.safetensors',
      encoder: 'qwen3vl_32b_minimax_h3_int8_convrot.safetensors',
      vae: 'minimax_h3_image_vae_fp16.safetensors'
    }
  };
  const RATIOS = ['1:1','5:4','4:5','4:3','3:4','3:2','2:3','16:9','9:16','21:9','3:1','1:3'];
  const RESOLUTIONS = ['1K','2K','4K','MAX'];
  const REQUIRED = ['UNETLoader','CLIPLoader','VAELoader','MiniMaxH3ImageConditioning','ConditioningZeroOut','KSampler','VAEDecode','SaveImage'];
  const MCP = {
    family: 'MiniMax H3 Image',
    maxReferences: 16,
    ratios: RATIOS,
    resolutions: RESOLUTIONS,
    defaultResolution: '2K',
    fixedSteps: 6,
    supportsTransparent: false,
    referenceTag: '<Picture N>'
  };
  const TARGET_PIXELS = { '1K': 1024 ** 2, '2K': 2048 ** 2, '4K': 4096 ** 2, MAX: 20_000_000 };

  function dimensions(ratio='1:1', resolution='2K') {
    if (!RATIOS.includes(ratio) || !RESOLUTIONS.includes(resolution)) throw new Error('Invalid H3 Image dimensions');
    // MiniMax accepts custom canvases up to 20 MP. Keep both dimensions on the
    // 32-pixel grid used by the native latent while staying at or below the cap.
    const [rw,rh] = ratio.split(':').map(Number), pixels = TARGET_PIXELS[resolution];
    let width = Math.max(32, Math.floor(Math.sqrt(pixels * rw / rh) / 32) * 32);
    let height = Math.max(32, Math.floor(Math.sqrt(pixels * rh / rw) / 32) * 32);
    while (width * height > pixels) {
      if (width >= height) width -= 32; else height -= 32;
    }
    return [width,height];
  }

  function buildWorkflow(options={}) {
    const spec = MODELS[options.model ?? 'h3image'];
    if (!spec) throw new Error('Unknown H3 Image model');
    const prompt = String(options.prompt ?? '').trim();
    if (!prompt || prompt.length > 20000) throw new Error('Prompt must contain 1–20000 characters');
    const references = options.references ?? [];
    if (!Array.isArray(references) || references.length > 16 || references.some(name => typeof name !== 'string' || !name || name.includes('..') || name.startsWith('/'))) throw new Error('Invalid H3 Image references');
    const seed = Number(options.seed ?? 42);
    if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) throw new Error('Invalid seed');
    const resolution = String(options.resolution ?? '2K').toUpperCase();
    const [width,height] = dimensions(options.ratio ?? '1:1', resolution);
    const graph = {
      unet: { class_type:'UNETLoader', inputs:{ unet_name:options.diffusion ?? spec.diffusion, weight_dtype:'default' } },
      clip: { class_type:'CLIPLoader', inputs:{ clip_name:options.encoder ?? spec.encoder, type:'minimax', device:'default' } },
      vae: { class_type:'VAELoader', inputs:{ vae_name:options.vae ?? spec.vae } },
      conditioning: { class_type:'MiniMaxH3ImageConditioning', inputs:{ clip:['clip',0], vae:['vae',0], prompt, width, height } },
      negative: { class_type:'ConditioningZeroOut', inputs:{ conditioning:['conditioning',0] } },
      sampler: { class_type:'KSampler', inputs:{ model:['unet',0], positive:['conditioning',0], negative:['negative',0], latent_image:['conditioning',1], seed, steps:6, cfg:1, sampler_name:'euler', scheduler:'simple', denoise:1 } },
      decode: { class_type:'VAEDecode', inputs:{ samples:['sampler',0], vae:['vae',0] } },
      save: { class_type:'SaveImage', inputs:{ images:['decode',0], filename_prefix:'image/Kendo_H3_Image' } }
    };
    references.forEach((image,index) => {
      const id = `reference_${index + 1}`;
      graph[id] = { class_type:'LoadImage', inputs:{ image } };
      graph.conditioning.inputs[`images.image_${index + 1}`] = [id,0];
    });
    return graph;
  }

  function readiness(info, model='h3image') {
    const spec = MODELS[model];
    if (!spec) throw new Error('Unknown H3 Image model');
    const missingNodes = REQUIRED.filter(name => !info[name]);
    const find = (node,input,filename) => (info[node]?.input?.required?.[input]?.[0] ?? []).find(name => name === filename || name.endsWith('/' + filename));
    const files = {
      diffusion: find('UNETLoader','unet_name',spec.diffusion),
      encoder: find('CLIPLoader','clip_name',spec.encoder),
      vae: find('VAELoader','vae_name',spec.vae)
    };
    const missingFileNames = Object.entries(files).filter(([,value]) => !value).map(([key]) => spec[key]);
    return { ready:!missingNodes.length && !missingFileNames.length, missingNodes, missingFileNames, files };
  }

  const api = { MODELS, RATIOS, RESOLUTIONS, REQUIRED, MCP, dimensions, buildWorkflow, readiness };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KendoH3Image = api;
})(typeof window === 'object' ? window : globalThis);
