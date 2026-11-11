const test=require('node:test');
const assert=require('node:assert/strict');
const native=require('../web/workflow-h3-image.js');

test('H3 Image uses the official six-step native sampler graph',()=>{
  const graph=native.buildWorkflow({prompt:'A cinematic portrait',ratio:'16:9',resolution:'4K',seed:123});
  assert.equal(graph.conditioning.class_type,'MiniMaxH3ImageConditioning');
  assert.equal(graph.clip.inputs.type,'minimax');
  assert.equal(graph.sampler.inputs.steps,6);
  assert.equal(graph.sampler.inputs.cfg,1);
  assert.equal(graph.sampler.inputs.sampler_name,'euler');
  assert.equal(graph.sampler.inputs.scheduler,'simple');
  assert.deepEqual(graph.sampler.inputs.latent_image,['conditioning',1]);
  assert.equal(graph.save.inputs.filename_prefix,'image/Kendo_H3_Image');
});

test('H3 Image supports 16 ordered references and rejects a seventeenth',()=>{
  const references=Array.from({length:16},(_,i)=>`ref-${i+1}.png`);
  const graph=native.buildWorkflow({prompt:'Combine the references',references,resolution:'2K'});
  assert.deepEqual(graph.conditioning.inputs['images.image_1'],['reference_1',0]);
  assert.deepEqual(graph.conditioning.inputs['images.image_16'],['reference_16',0]);
  assert.equal(graph.reference_16.inputs.image,'ref-16.png');
  assert.throws(()=>native.buildWorkflow({prompt:'x',references:[...references,'too-many.png']}),/Invalid H3 Image references/);
});

test('MAX stays at 20 MP and reaches a near-8K long edge only on extreme ratios',()=>{
  const [wideW,wideH]=native.dimensions('3:1','MAX');
  const [squareW,squareH]=native.dimensions('1:1','MAX');
  assert.ok(wideW>=7680 && wideW<=8192);
  assert.ok(wideW*wideH<=20_000_000);
  assert.equal(squareW,squareH);
  assert.ok(squareW<5000);
});

test('readiness requires native nodes and all three exact files',()=>{
  const info=Object.fromEntries(native.REQUIRED.map(name=>[name,{}]));
  const model=native.MODELS.h3image;
  info.UNETLoader={input:{required:{unet_name:[[model.diffusion]]}}};
  info.CLIPLoader={input:{required:{clip_name:[[model.encoder]]}}};
  info.VAELoader={input:{required:{vae_name:[[model.vae]]}}};
  assert.equal(native.readiness(info).ready,true);
  delete info.MiniMaxH3ImageConditioning;
  assert.equal(native.readiness(info).ready,false);
});
