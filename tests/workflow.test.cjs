const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildWorkflow}=require('../web/workflow.js');
const base={prompt:'test',ratio:'16:9',megapixels:0.4,duration:5,steps:20};
test('full reference graph uses Ref2VA, 9 images, 1 video and 3 standalone audios',()=>{
 const w=buildWorkflow({...base,images:Array.from({length:9},(_,i)=>i+'.png'),videos:['a.mp4'],audios:['a.wav','b.wav','c.wav'],videoAudio:true});
 assert.match(w.model.inputs.unet_name,/ref2va/);
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
 assert.ok(!Object.values(w).some(x=>x.class_type.includes('Lora')));
});
test('enforce supported limits before submitting',()=>{
 for(const refs of [{images:Array(10).fill('a.png')},{videos:['a','b']},{audios:['a','b','c','d']}])assert.throws(()=>buildWorkflow({...base,...refs}));
 assert.throws(()=>buildWorkflow({...base,duration:20}));
 assert.throws(()=>buildWorkflow({...base,steps:NaN}));
});
