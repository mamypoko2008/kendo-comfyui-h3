const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildWorkflow,REALISM_LORA,REALISM_TRIGGER}=require('../web/workflow-v3-beta.js');

const base={prompt:'cinematic portrait',ratio:'16:9',megapixels:0.4,duration:5,steps:10,seed:123456789};

test('v3 beta uses standard H3, stacked LoRAs and workflow-scoped KJ SageAttention',()=>{
  const w=buildWorkflow(base);
  assert.equal(w.model.class_type,'UNETLoader');
  assert.equal(w.turbo.class_type,'LoraLoaderModelOnly');
  assert.equal(w.realism.class_type,'LoraLoaderModelOnly');
  assert.equal(w.realism.inputs.lora_name,REALISM_LORA);
  assert.equal(w.realism.inputs.strength_model,0.75);
  assert.deepEqual(w.realism.inputs.model,['turbo',0]);
  assert.equal(w.sage.class_type,'PathchSageAttentionKJ');
  assert.equal(w.sage.inputs.sage_attention,'auto');
  assert.equal(w.sage.inputs.allow_compile,false);
  assert.deepEqual(w.sage.inputs.model,['realism',0]);
  assert.deepEqual(w.guider.inputs.model,['sage',0]);
  assert.deepEqual(w.schedule.inputs.model,['sage',0]);
  assert.match(w.reference.inputs.prompt,new RegExp('^'+REALISM_TRIGGER+', '));
  assert.equal(w.noise.inputs.noise_seed,123456789);
  assert.equal(w.save.inputs.filename_prefix,'video/Kendo_H3_v3_beta10');
  assert.ok(!JSON.stringify(w).match(/Upscale|SeedVR2|RTXVideo|FlashVSR/));
});

test('Realism LoRA can be disabled without disabling Turbo or KJ SageAttention',()=>{
  const w=buildWorkflow({...base,realismEnabled:false,realismWeight:0.75});
  assert.ok(!w.realism);
  assert.deepEqual(w.sage.inputs.model,['turbo',0]);
  assert.equal(w.reference.inputs.prompt,base.prompt);
});

test('custom LoRA weight and existing trigger are preserved',()=>{
  const w=buildWorkflow({...base,prompt:'r34l1sm, close-up',realismWeight:1.1});
  assert.equal(w.realism.inputs.strength_model,1.1);
  assert.equal(w.reference.inputs.prompt,'r34l1sm, close-up');
  for(const weight of [-0.1,2.1,NaN])assert.throws(()=>buildWorkflow({...base,realismWeight:weight}),/LoRA/);
});

test('supports all reference inputs and validates limits',()=>{
  const w=buildWorkflow({...base,images:Array.from({length:9},(_,i)=>i+'.png'),videos:['ref.mp4'],audios:['a.wav','b.wav','c.wav'],videoAudio:true});
  assert.deepEqual(w.reference.inputs['ref_images.ref_image_8'],['image8',0]);
  assert.deepEqual(w.reference.inputs['ref_videos.ref_video_0'],['refVideo0',0]);
  assert.deepEqual(w.reference.inputs['ref_video_audios.ref_video_audio_0'],['refVideo0',2]);
  assert.deepEqual(w.reference.inputs['ref_audios.ref_audio_2'],['audio2',0]);
  for(const refs of [{images:Array(10).fill('a')},{videos:['a','b']},{audios:['a','b','c','d']}])assert.throws(()=>buildWorkflow({...base,...refs}));
});

test('validates 32-bit seed and generation settings',()=>{
  for(const seed of [-1,4294967296,1.5,NaN])assert.throws(()=>buildWorkflow({...base,seed}),/seed/);
  assert.equal(buildWorkflow({...base,duration:20}).reference.inputs.length,481);
  assert.throws(()=>buildWorkflow({...base,duration:21}));
});
