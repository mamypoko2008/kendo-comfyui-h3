const test=require('node:test');
const assert=require('node:assert/strict');
const {buildWorkflow}=require('../web/workflow-v4-beta2.js');

const base={prompt:'cinematic portrait',ratio:'9:16',megapixels:0.5,duration:5,steps:8,seed:123,model:'singularity'};

test('Fast mode remains a single-pass V3-compatible graph',()=>{
  const w=buildWorkflow({...base,renderMode:'fast'});
  assert.equal(w.model.inputs.unet_name,'Minimax-h3_Singularity_ref2va_v2_pruned_int8.safetensors');
  assert.equal(w.schedule.inputs.scheduler,'simple');
  assert.ok(w.sample);
  assert.ok(!w.upscale);
  assert.ok(!w.splitSigmas);
  assert.equal(w.save.inputs.filename_prefix,'video/Kendo_H3_V4_Beta2_Fast_Singularity');
});

test('High Resolution mode splits sigmas, preserves audio and refines an upscaled video latent',()=>{
  const w=buildWorkflow({...base,renderMode:'highres',upscaleFactor:2});
  assert.equal(w.schedule.inputs.scheduler,'beta');
  assert.deepEqual(w.splitSigmas.inputs.sigmas,['sigmaRefiner',0]);
  assert.equal(w.splitSigmas.inputs.step,4);
  assert.deepEqual(w.separateAV.inputs.av_latent,['sampleLow',1]);
  assert.deepEqual(w.concatAV.inputs.video_latent,['upscale',0]);
  assert.deepEqual(w.concatAV.inputs.audio_latent,['separateAV',1]);
  assert.equal(w.upscale.inputs['mode.scale'],2);
  assert.equal(w.upscale.inputs.enable_temporal_chunking,true);
  assert.equal(w.upscale.inputs.force_unload,true);
  assert.deepEqual(w.sample.inputs.sigmas,['splitSigmas',1]);
  assert.deepEqual(w.sample.inputs.latent_image,['concatAV',0]);
  assert.equal(w.save.inputs.filename_prefix,'video/Kendo_H3_V4_Beta2_HiRes_Singularity');
});

test('Optional quality LoRAs are explicit and keep the requested strengths',()=>{
  const w=buildWorkflow({...base,renderMode:'highres',realismEnabled:true,realismStrength:.3,facialEnabled:true,facialStrength:1});
  assert.equal(w.facial.inputs.lora_name,'minimax-h3-facial-realism-closeup-cp2000.safetensors');
  assert.equal(w.facial.inputs.strength_model,1);
  assert.equal(w.realism.inputs.lora_name,'h3-realism-people-t2v-i2v-r2v.safetensors');
  assert.equal(w.realism.inputs.strength_model,.3);
  assert.deepEqual(w.guider.inputs.model,['realism',0]);
});

test('KJ memory mode uses one explicit KJ patch while global Sage relies on the process flag',()=>{
  const global=buildWorkflow({...base,renderMode:'highres',attentionMode:'global_sage'});
  const memory=buildWorkflow({...base,renderMode:'highres',attentionMode:'kj_memory'});
  assert.ok(!global.sage);
  assert.equal(memory.sage.class_type,'MiniMaxH3MemoryEfficientSageAttentionPatch');
  assert.deepEqual(memory.sigmaShift.inputs.model,['sage',0]);
});

test('High Resolution rejects oversized bases and accepts all existing references',()=>{
  assert.throws(()=>buildWorkflow({...base,megapixels:1,renderMode:'highres'}),/0.7 MP/);
  const w=buildWorkflow({...base,renderMode:'highres',images:['a.png'],videos:['v.mp4'],audios:['a.wav'],videoAudio:true});
  assert.deepEqual(w.reference.inputs['ref_images.ref_image_0'],['image0',0]);
  assert.deepEqual(w.reference.inputs['ref_videos.ref_video_0'],['refVideo0',0]);
  assert.deepEqual(w.reference.inputs['ref_video_audios.ref_video_audio_0'],['refVideo0',2]);
  assert.deepEqual(w.reference.inputs['ref_audios.ref_audio_0'],['audio0',0]);
});
