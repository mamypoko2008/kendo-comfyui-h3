/* Shared by the browser and dependency-free workflow tests. */
(function (root) {
  function buildWorkflow({prompt, ratio, megapixels, duration, steps, images = [], videos = [], audios = [], videoAudio = false}) {
    if (images.length > 9 || videos.length > 1 || audios.length > 3) throw new Error('Reference limit exceeded');
    if (!prompt.trim()) throw new Error('Prompt is required');
    if (!(duration >= 5 && duration <= 15) || !(steps >= 1 && steps <= 50)) throw new Error('Invalid generation settings');
    const sizes = {'0.4':[864,480], '0.7':[1152,640], '1':[1376,768]};
    if (!sizes[String(megapixels)] || !['16:9','9:16','1:1'].includes(ratio)) throw new Error('Invalid resolution');
    let [width,height] = sizes[String(megapixels)];
    if (ratio === '9:16') [width,height] = [height,width];
    if (ratio === '1:1') width = height = Math.round(Math.sqrt(megapixels * 1e6) / 32) * 32;
    const frames = Math.ceil((Math.round(duration * 24) - 5) / 17) * 17 + 5;
    const n = (class_type, inputs) => ({class_type, inputs});
    const w = {
      model:n('UNETLoader',{unet_name:'minimax_h3_ref2va_pruned_int8_convrot.safetensors',weight_dtype:'default'}),
      clip:n('CLIPLoader',{clip_name:'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',type:'minimax',device:'default'}),
      vae:n('VAELoader',{vae_name:'minimax_h3_video_vae_fp16.safetensors'}),
      audioVae:n('VAELoader',{vae_name:'minimax_h3_audio_vae_fp32.safetensors'}),
      reference:n('MiniMaxH3ReferenceToVideo',{prompt,width,height,length:frames,ref_image_size:'match',clip:['clip',0],vae:['vae',0],audio_vae:['audioVae',0]}),
      noise:n('RandomNoise',{noise_seed:Math.floor(Math.random()*Number.MAX_SAFE_INTEGER)}),
      guider:n('BasicGuider',{model:['model',0],conditioning:['reference',0]}),
      sampler:n('KSamplerSelect',{sampler_name:'res_multistep'}),
      schedule:n('BasicScheduler',{scheduler:'simple',steps,denoise:1,model:['model',0]}),
      sample:n('SamplerCustomAdvanced',{noise:['noise',0],guider:['guider',0],sampler:['sampler',0],sigmas:['schedule',0],latent_image:['reference',1]}),
      decode:n('VAEDecode',{samples:['sample',0],vae:['vae',0]}),
      decodeAudio:n('VAEDecodeAudio',{samples:['sample',0],vae:['audioVae',0]}),
      video:n('CreateVideo',{fps:24,bit_depth:8,images:['decode',0],audio:['decodeAudio',0]}),
      save:n('SaveVideo',{filename_prefix:'video/Kendo_H3_v2',format:'auto',codec:'auto',video:['video',0]})
    };
    images.forEach((image,i)=>{w['image'+i]=n('LoadImage',{image});w.reference.inputs['ref_images.ref_image_'+i]=['image'+i,0]});
    videos.forEach((video,i)=>{
      w['refVideo'+i]=n('VHS_LoadVideo',{video,force_rate:24,custom_width:0,custom_height:0,frame_load_cap:frames,skip_first_frames:0,select_every_nth:1});
      w.reference.inputs['ref_videos.ref_video_'+i]=['refVideo'+i,0];
      if(videoAudio) w.reference.inputs['ref_video_audios.ref_video_audio_'+i]=['refVideo'+i,2];
    });
    audios.forEach((audio,i)=>{w['audio'+i]=n('LoadAudio',{audio});w.reference.inputs['ref_audios.ref_audio_'+i]=['audio'+i,0]});
    return w;
  }
  if(typeof module !== 'undefined') module.exports={buildWorkflow};
  else root.KendoWorkflow={buildWorkflow};
})(globalThis);
