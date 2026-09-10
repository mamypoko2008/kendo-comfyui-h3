/* Shared by the browser and dependency-free workflow tests. */
(function (root) {
  function buildWorkflow({prompt, ratio, megapixels, duration, steps, images = [], videos = [], audios = [], videoAudio = false, upscale = false, upscaleScale = 2, upscalePreset = 'Fast (2x Speed)'}) {
    if (images.length > 9 || videos.length > 1 || audios.length > 3) throw new Error('Reference limit exceeded');
    if (!prompt.trim()) throw new Error('Prompt is required');
    if (!(duration >= 5 && duration <= 20) || !(steps >= 1 && steps <= 50)) throw new Error('Invalid generation settings');
    const sizes = {'0.4':[864,480], '0.7':[1152,640], '1':[1344,768], '1.2':[1504,832], '1.5':[1632,928], '2':[1920,1088]};
    if (!sizes[String(megapixels)] || !['16:9','9:16','1:1'].includes(ratio)) throw new Error('Invalid resolution');
    if (upscale && megapixels !== 1) throw new Error('Video upscale requires the native 1 MP source');
    if (upscale && ![2,4].includes(upscaleScale)) throw new Error('Invalid upscale scale');
    const upscalePresets = ['Fast (2x Speed)','Balanced (2x Quality)','Long Video (Low VRAM)','High Quality (Best)'];
    if (upscale && !upscalePresets.includes(upscalePreset)) throw new Error('Invalid upscale preset');
    let [width,height] = sizes[String(megapixels)];
    if (ratio === '9:16') [width,height] = [height,width];
    if (ratio === '1:1') width = height = Math.round(Math.sqrt(megapixels * 1e6) / 32) * 32;
    const frames = Math.ceil((Math.round(duration * 24) - 5) / 17) * 17 + 5;
    const n = (class_type, inputs) => ({class_type, inputs});
    const w = {
      model:n('UNETLoader',{unet_name:'minimax_h3_ref2va_pruned_int8_convrot.safetensors',weight_dtype:'default'}),
      turbo:n('LoraLoaderModelOnly',{lora_name:'minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors',strength_model:1,model:['model',0]}),
      clip:n('CLIPLoader',{clip_name:'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',type:'minimax',device:'default'}),
      vae:n('VAELoader',{vae_name:'minimax_h3_video_vae_fp16.safetensors'}),
      audioVae:n('VAELoader',{vae_name:'minimax_h3_audio_vae_fp32.safetensors'}),
      reference:n('MiniMaxH3ReferenceToVideo',{prompt,width,height,length:frames,ref_image_size:'match',clip:['clip',0],vae:['vae',0],audio_vae:['audioVae',0]}),
      noise:n('RandomNoise',{noise_seed:Math.floor(Math.random()*Number.MAX_SAFE_INTEGER)}),
      guider:n('BasicGuider',{model:['turbo',0],conditioning:['reference',0]}),
      sampler:n('KSamplerSelect',{sampler_name:'euler'}),
      schedule:n('BasicScheduler',{scheduler:'simple',steps,denoise:1,model:['turbo',0]}),
      sample:n('SamplerCustomAdvanced',{noise:['noise',0],guider:['guider',0],sampler:['sampler',0],sigmas:['schedule',0],latent_image:['reference',1]}),
      decode:n('VAEDecode',{samples:['sample',0],vae:['vae',0]}),
      decodeAudio:n('VAEDecodeAudio',{samples:['sample',0],vae:['audioVae',0]}),
      video:n('CreateVideo',{fps:24,bit_depth:8,images:['decode',0],audio:['decodeAudio',0]}),
      save:n('SaveVideo',{filename_prefix:'video/Kendo_H3_v3_beta',format:'auto',codec:'auto',video:['video',0]})
    };
    if (upscale) {
      w.upscale = n('AILab_FlashVSR',{frames:['decode',0],preset:upscalePreset,scale:upscaleScale,unload_model:false,seed:Math.floor(Math.random()*Number.MAX_SAFE_INTEGER),audio:['decodeAudio',0]});
      w.video.inputs.images = ['upscale',0];
      w.video.inputs.audio = ['upscale',1];
      w.save.inputs.filename_prefix = 'video/Kendo_H3_v3_beta_upscaled';
    }
    images.forEach((image,i)=>{w['image'+i]=n('LoadImage',{image});w.reference.inputs['ref_images.ref_image_'+i]=['image'+i,0]});
    videos.forEach((video,i)=>{
      w['refVideo'+i]=n('VHS_LoadVideo',{video,force_rate:24,custom_width:0,custom_height:0,frame_load_cap:frames,skip_first_frames:0,select_every_nth:1});
      w.reference.inputs['ref_videos.ref_video_'+i]=['refVideo'+i,0];
      if(videoAudio) w.reference.inputs['ref_video_audios.ref_video_audio_'+i]=['refVideo'+i,2];
    });
    audios.forEach((audio,i)=>{w['audio'+i]=n('LoadAudio',{audio});w.reference.inputs['ref_audios.ref_audio_'+i]=['audio'+i,0]});
    return w;
  }
  function buildUpscaleWorkflow({video, scale = 2, preset = 'Fast (2x Speed)'}) {
    if (!video) throw new Error('Video is required');
    if (![2,4].includes(scale)) throw new Error('Invalid upscale scale');
    const presets = ['Fast (2x Speed)','Balanced (2x Quality)','Long Video (Low VRAM)','High Quality (Best)'];
    if (!presets.includes(preset)) throw new Error('Invalid upscale preset');
    const n = (class_type, inputs) => ({class_type, inputs});
    return {
      source:n('VHS_LoadVideo',{video,force_rate:24,custom_width:0,custom_height:0,frame_load_cap:0,skip_first_frames:0,select_every_nth:1}),
      upscale:n('AILab_FlashVSR',{frames:['source',0],preset,scale,unload_model:false,seed:Math.floor(Math.random()*Number.MAX_SAFE_INTEGER),audio:['source',2]}),
      video:n('CreateVideo',{fps:24,bit_depth:8,images:['upscale',0],audio:['upscale',1]}),
      save:n('SaveVideo',{filename_prefix:'video/Kendo_H3_v3_beta_upscaled',format:'auto',codec:'auto',video:['video',0]})
    };
  }
  if(typeof module !== 'undefined') module.exports={buildWorkflow,buildUpscaleWorkflow};
  else root.KendoWorkflow={buildWorkflow,buildUpscaleWorkflow};
})(globalThis);
