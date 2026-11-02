/* Kendo H3 V4 beta.2: V3-compatible fast graph plus optional dual-pass latent upscale. */
(function (root) {
  const MODELS = {
    original: 'minimax_h3_ref2va_pruned_int8_convrot.safetensors',
    singularity: 'Minimax-h3_Singularity_ref2va_v2_pruned_int8.safetensors'
  };
  const SIZES = {
    '0.4': [864, 480], '0.5': [960, 544], '0.7': [1152, 640],
    '1': [1376, 768], '1.2': [1504, 832], '1.5': [1632, 928], '2': [1920, 1088]
  };
  const LORAS = {
    turbo: 'minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors',
    realism: 'h3-realism-people-t2v-i2v-r2v.safetensors',
    facial: 'minimax-h3-facial-realism-closeup-cp2000.safetensors'
  };

  function buildWorkflow({
    prompt, ratio, megapixels, duration, steps, seed = Math.floor(Math.random() * 0x100000000),
    model = 'original', images = [], videos = [], audios = [], videoAudio = false,
    attentionMode = 'global_sage', renderMode = 'fast', upscaleFactor = 2,
    realismEnabled = false, realismStrength = 0.3,
    facialEnabled = false, facialStrength = 1
  }) {
    if (images.length > 9 || videos.length > 1 || audios.length > 3) throw new Error('Reference limit exceeded');
    if (!String(prompt || '').trim()) throw new Error('Prompt is required');
    if (!(duration >= 5 && duration <= 20) || !(steps >= 1 && steps <= 50)) throw new Error('Invalid generation settings');
    if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) throw new Error('Invalid seed');
    if (!MODELS[model]) throw new Error('Invalid model');
    if (!SIZES[String(megapixels)] || !['16:9', '9:16', '1:1'].includes(ratio)) throw new Error('Invalid resolution');
    if (!['fast', 'highres'].includes(renderMode)) throw new Error('Invalid render mode');
    if (!['global_sage', 'kj_memory'].includes(attentionMode)) throw new Error('Invalid attention mode');
    if (renderMode === 'highres' && ![1.5, 2].includes(Number(upscaleFactor))) throw new Error('Upscale must be 1.5x or 2x');
    if (renderMode === 'highres' && Number(megapixels) > 0.7) throw new Error('High Resolution base size must be 0.7 MP or lower');
    if (!(realismStrength >= 0 && realismStrength <= 2) || !(facialStrength >= 0 && facialStrength <= 2)) throw new Error('Invalid LoRA strength');

    let [width, height] = SIZES[String(megapixels)];
    if (ratio === '9:16') [width, height] = [height, width];
    if (ratio === '1:1') width = height = Math.round(Math.sqrt(Number(megapixels) * 1e6) / 32) * 32;
    const frames = Math.ceil((Math.round(duration * 24) - 5) / 17) * 17 + 5;
    const n = (class_type, inputs) => ({ class_type, inputs });
    const w = {
      model: n('UNETLoader', { unet_name: MODELS[model], weight_dtype: 'default' }),
      clip: n('CLIPLoader', { clip_name: 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors', type: 'minimax', device: 'default' }),
      vae: n('VAELoader', { vae_name: 'minimax_h3_video_vae_fp16.safetensors' }),
      audioVae: n('VAELoader', { vae_name: 'minimax_h3_audio_vae_fp32.safetensors' }),
      noise: n('RandomNoise', { noise_seed: seed }),
      sampler: n('KSamplerSelect', { sampler_name: 'euler' })
    };

    let modelRef = ['model', 0];
    if (attentionMode === 'kj_memory') {
      w.sage = n('MiniMaxH3MemoryEfficientSageAttentionPatch', { model: modelRef });
      modelRef = ['sage', 0];
    }
    if (renderMode === 'highres') {
      w.sigmaShift = n('MiniMaxH3SigmaShift', { model: modelRef, shift_video: 12, shift_audio: 3 });
      modelRef = ['sigmaShift', 0];
    }
    w.turbo = n('LoraLoaderModelOnly', { lora_name: LORAS.turbo, strength_model: 1, model: modelRef });
    modelRef = ['turbo', 0];
    if (facialEnabled) {
      w.facial = n('LoraLoaderModelOnly', { lora_name: LORAS.facial, strength_model: Number(facialStrength), model: modelRef });
      modelRef = ['facial', 0];
    }
    if (realismEnabled) {
      w.realism = n('LoraLoaderModelOnly', { lora_name: LORAS.realism, strength_model: Number(realismStrength), model: modelRef });
      modelRef = ['realism', 0];
    }

    w.reference = n('MiniMaxH3ReferenceToVideo', {
      prompt, width, height, length: frames, ref_image_size: 'match',
      clip: ['clip', 0], vae: ['vae', 0], audio_vae: ['audioVae', 0]
    });
    w.guider = n('BasicGuider', { model: modelRef, conditioning: ['reference', 0] });
    w.schedule = n('BasicScheduler', {
      scheduler: renderMode === 'highres' ? 'beta' : 'simple', steps, denoise: 1, model: modelRef
    });

    if (renderMode === 'highres') {
      const splitStep = Math.max(1, Math.min(4, Math.floor(steps / 2)));
      w.sigmaRefiner = n('H3SigmaRefiner', {
        sigmas: ['schedule', 0], extra_steps: 1, start_at_sigma: 0.7, end_at_sigma: 0, spacing: 'cosine'
      });
      w.splitSigmas = n('SplitSigmas', { sigmas: ['sigmaRefiner', 0], step: splitStep });
      w.sampleLow = n('SamplerCustomAdvanced', {
        noise: ['noise', 0], guider: ['guider', 0], sampler: ['sampler', 0],
        sigmas: ['splitSigmas', 0], latent_image: ['reference', 1]
      });
      w.separateAV = n('LTXVSeparateAVLatent', { av_latent: ['sampleLow', 1] });
      w.upscale = n('MinimaxH3LatentUpscaler3D', {
        latent: ['separateAV', 0],
        model_name: 'minimax_h3_latent_upscaler_3d_conv_v1_bf16.safetensors',
        mode: 'scale by multiplier', 'mode.scale': Number(upscaleFactor), align: 32,
        enable_temporal_chunking: true, force_unload: true, device: 'cuda', precision: 'fp16'
      });
      w.concatAV = n('LTXVConcatAVLatent', { video_latent: ['upscale', 0], audio_latent: ['separateAV', 1] });
      w.sample = n('SamplerCustomAdvanced', {
        noise: ['noise', 0], guider: ['guider', 0], sampler: ['sampler', 0],
        sigmas: ['splitSigmas', 1], latent_image: ['concatAV', 0]
      });
    } else {
      w.sample = n('SamplerCustomAdvanced', {
        noise: ['noise', 0], guider: ['guider', 0], sampler: ['sampler', 0],
        sigmas: ['schedule', 0], latent_image: ['reference', 1]
      });
    }

    w.decode = n('VAEDecode', { samples: ['sample', 0], vae: ['vae', 0] });
    w.decodeAudio = n('VAEDecodeAudio', { samples: ['sample', 0], vae: ['audioVae', 0] });
    w.video = n('CreateVideo', { fps: 24, bit_depth: 8, images: ['decode', 0], audio: ['decodeAudio', 0] });
    const modeName = renderMode === 'highres' ? 'HiRes' : 'Fast';
    const modelName = model === 'singularity' ? 'Singularity' : 'Original';
    w.save = n('SaveVideo', { filename_prefix: `video/Kendo_H3_V4_Beta2_${modeName}_${modelName}`, format: 'auto', codec: 'auto', video: ['video', 0] });

    images.forEach((image, i) => { w['image' + i] = n('LoadImage', { image }); w.reference.inputs['ref_images.ref_image_' + i] = ['image' + i, 0]; });
    videos.forEach((video, i) => {
      w['refVideo' + i] = n('VHS_LoadVideo', { video, force_rate: 24, custom_width: 0, custom_height: 0, frame_load_cap: frames, skip_first_frames: 0, select_every_nth: 1 });
      w.reference.inputs['ref_videos.ref_video_' + i] = ['refVideo' + i, 0];
      if (videoAudio) w.reference.inputs['ref_video_audios.ref_video_audio_' + i] = ['refVideo' + i, 2];
    });
    audios.forEach((audio, i) => { w['audio' + i] = n('LoadAudio', { audio }); w.reference.inputs['ref_audios.ref_audio_' + i] = ['audio' + i, 0]; });
    return w;
  }

  if (typeof module !== 'undefined') module.exports = { buildWorkflow, SIZES };
  else root.KendoWorkflow = { buildWorkflow, SIZES };
})(globalThis);
