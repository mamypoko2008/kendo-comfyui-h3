const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildWorkflow,buildUpscaleWorkflow}=require('../web/workflow-v3-beta.js');

const base={prompt:'test',ratio:'16:9',megapixels:1,duration:5,steps:10};

test('v3 beta keeps the v2 graph unchanged when upscale is off',()=>{
  const w=buildWorkflow(base);
  assert.ok(!w.upscale);
  assert.deepEqual(w.video.inputs.images,['decode',0]);
  assert.equal(w.save.inputs.filename_prefix,'video/Kendo_H3_v3_beta');
});

test('inline FlashVSR upscale uses native H3 resolution and preserves audio',()=>{
  const w=buildWorkflow({...base,upscale:true,upscaleScale:2,upscalePreset:'Fast (2x Speed)'});
  assert.equal(w.reference.inputs.width,1344);
  assert.equal(w.reference.inputs.height,768);
  assert.equal(w.upscale.class_type,'AILab_FlashVSR');
  assert.equal(w.upscale.inputs.scale,2);
  assert.equal(w.upscale.inputs.preset,'Fast (2x Speed)');
  assert.deepEqual(w.upscale.inputs.frames,['decode',0]);
  assert.deepEqual(w.upscale.inputs.audio,['decodeAudio',0]);
  assert.deepEqual(w.video.inputs.images,['upscale',0]);
  assert.deepEqual(w.video.inputs.audio,['upscale',1]);
});

test('upscale requires native 1 MP and supported FlashVSR settings',()=>{
  assert.throws(()=>buildWorkflow({...base,megapixels:.7,upscale:true}),/native 1 MP/);
  assert.throws(()=>buildWorkflow({...base,upscale:true,upscaleScale:3}),/scale/);
  assert.throws(()=>buildWorkflow({...base,upscale:true,upscalePreset:'unknown'}),/preset/);
});

test('history upscale graph skips H3 generation and passes source audio',()=>{
  const w=buildUpscaleWorkflow({video:'old.mp4',scale:4,preset:'Long Video (Low VRAM)'});
  assert.equal(w.source.class_type,'VHS_LoadVideo');
  assert.equal(w.source.inputs.video,'old.mp4');
  assert.equal(w.upscale.class_type,'AILab_FlashVSR');
  assert.deepEqual(w.upscale.inputs.frames,['source',0]);
  assert.deepEqual(w.upscale.inputs.audio,['source',2]);
  assert.equal(w.upscale.inputs.scale,4);
  assert.ok(!w.model&&!w.reference&&!w.sample);
});
