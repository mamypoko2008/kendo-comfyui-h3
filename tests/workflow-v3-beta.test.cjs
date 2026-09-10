const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildWorkflow,buildUpscaleWorkflow}=require('../web/workflow-v3-beta.js');

const base={prompt:'test',ratio:'16:9',megapixels:1,duration:5,steps:10};

test('v3 beta keeps the v2 graph unchanged when upscale is off',()=>{
  const w=buildWorkflow(base);
  assert.ok(!w.upscale);
  assert.deepEqual(w.video.inputs.images,['decode',0]);
  assert.equal(w.save.inputs.filename_prefix,'video/Kendo_H3_v3_beta5');
});

test('fast history upscale uses Real-ESRGAN and preserves source audio',()=>{
  const w=buildUpscaleWorkflow({video:'old.mp4',engine:'realesrgan'});
  assert.equal(w.source.class_type,'VHS_LoadVideo');
  assert.equal(w.upscaleModel.class_type,'UpscaleModelLoader');
  assert.equal(w.upscaleModel.inputs.model_name,'RealESRGAN_x2plus.pth');
  assert.equal(w.upscale.class_type,'ImageUpscaleWithModel');
  assert.deepEqual(w.upscale.inputs.image,['source',0]);
  assert.deepEqual(w.video.inputs.audio,['source',2]);
});

test('quality history upscale uses SeedVR2 temporal workflow',()=>{
  const w=buildUpscaleWorkflow({video:'old.mp4',engine:'seedvr2',targetResolution:1080});
  assert.equal(w.seedDit.class_type,'SeedVR2LoadDiTModel');
  assert.equal(w.seedDit.inputs.model,'seedvr2_ema_3b_fp8_e4m3fn.safetensors');
  assert.equal(w.seedVae.class_type,'SeedVR2LoadVAEModel');
  assert.equal(w.upscale.class_type,'SeedVR2VideoUpscaler');
  assert.ok(Number.isInteger(w.upscale.inputs.seed));
  assert.ok(w.upscale.inputs.seed >= 0 && w.upscale.inputs.seed <= 4294967295);
  assert.equal(w.upscale.inputs.resolution,1080);
  assert.equal(w.upscale.inputs.batch_size,5);
  assert.deepEqual(w.upscale.inputs.image,['source',0]);
  assert.deepEqual(w.video.inputs.audio,['source',2]);
});

test('upscale validates engine and skips H3 generation',()=>{
  assert.throws(()=>buildUpscaleWorkflow({video:'old.mp4',engine:'flashvsr'}),/engine/);
  assert.throws(()=>buildUpscaleWorkflow({video:'old.mp4',engine:'seedvr2',targetResolution:720}),/resolution/);
  const w=buildUpscaleWorkflow({video:'old.mp4'});
  assert.ok(!w.model&&!w.reference&&!w.sample);
  assert.ok(!JSON.stringify(w).includes('FlashVSR'));
});
