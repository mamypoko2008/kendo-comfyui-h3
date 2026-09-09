const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildWorkflow}=require('../web/workflow.js');
const base={prompt:'test',ratio:'16:9',megapixels:0.4,duration:5,steps:10};
test('full reference graph uses Ref2VA Turbo, 9 images, 1 video and 3 standalone audios',()=>{
 const w=buildWorkflow({...base,images:Array.from({length:9},(_,i)=>i+'.png'),videos:['a.mp4'],audios:['a.wav','b.wav','c.wav'],videoAudio:true});
 assert.match(w.model.inputs.unet_name,/ref2va/);
 assert.equal(w.turbo.inputs.lora_name,'minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors');
 assert.deepEqual(w.guider.inputs.model,['turbo',0]);assert.deepEqual(w.schedule.inputs.model,['turbo',0]);assert.equal(w.sampler.inputs.sampler_name,'euler');
 assert.deepEqual(w.reference.inputs['ref_images.ref_image_8'],['image8',0]);
 assert.deepEqual(w.reference.inputs['ref_videos.ref_video_0'],['refVideo0',0]);
 assert.deepEqual(w.reference.inputs['ref_video_audios.ref_video_audio_0'],['refVideo0',2]);
 assert.deepEqual(w.reference.inputs['ref_audios.ref_audio_2'],['audio2',0]);
 assert.equal(w.refVideo0.inputs.force_rate,24);
 assert.equal(w.reference.inputs.length%17,5);
 for(const node of Object.values(w))for(const input of Object.values(node.inputs))if(Array.isArray(input))assert.ok(w[input[0]],'Missing linked node');
});
test('disabled media create no loader nodes or links',()=>{
 const w=buildWorkflow(base);assert.ok(!w.refVideo0&&!w.audio0);
 assert.ok(!Object.keys(w.reference.inputs).some(x=>x.startsWith('ref_audios.')));
 const v=buildWorkflow({...base,videos:['a.mp4']});assert.ok(!v.reference.inputs['ref_video_audios.ref_video_audio_0']);
});
test('enforce supported limits and allow 5-20 seconds',()=>{
 for(const refs of [{images:Array(10).fill('a.png')},{videos:['a','b']},{audios:['a','b','c','d']}])assert.throws(()=>buildWorkflow({...base,...refs}));
 assert.equal(buildWorkflow({...base,duration:20}).reference.inputs.length,481);
 assert.throws(()=>buildWorkflow({...base,duration:21}));
 assert.throws(()=>buildWorkflow({...base,steps:NaN}));
});
test('support all output resolution scales',()=>{
 const expected={'1.2':[1504,832],'1.5':[1632,928],'2':[1920,1088]};
 for(const [megapixels,[width,height]] of Object.entries(expected)){
  const wide=buildWorkflow({...base,megapixels:Number(megapixels)});assert.equal(wide.reference.inputs.width,width);assert.equal(wide.reference.inputs.height,height);
  const tall=buildWorkflow({...base,megapixels:Number(megapixels),ratio:'9:16'});assert.equal(tall.reference.inputs.width,height);assert.equal(tall.reference.inputs.height,width);
 }
});